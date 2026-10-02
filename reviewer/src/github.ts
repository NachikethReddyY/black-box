import { sha256 } from './hash.js';

export interface PullRequestRef { readonly owner: string; readonly repo: string; readonly number: number; }
export interface PullRequestSnapshot { readonly ref: PullRequestRef; readonly baseSha: string; readonly headSha: string; readonly title: string; readonly body: string | null; readonly draft: boolean; readonly state: 'open' | 'closed'; readonly mergeableState?: string; }
export interface PullRequestSummary { readonly ref: PullRequestRef; readonly headSha: string; readonly draft: boolean; readonly title: string; readonly authorLogin?: string; }
export interface PullRequestFile { readonly path: string; readonly status: string; readonly additions: number; readonly deletions: number; readonly patch?: string; }
export interface CiStatus { readonly ready: boolean; readonly pending: boolean; readonly failed: boolean; readonly count: number; readonly details: readonly string[]; }

export function changedRightLines(files: readonly PullRequestFile[]): ReadonlyMap<string, ReadonlySet<number>> {
  const result = new Map<string, Set<number>>();
  for (const file of files) {
    const lines = new Set<number>();
    let right = 0;
    for (const raw of (file.patch ?? '').split('\n')) {
      if (raw.startsWith('@@')) {
        const match = /\+(\d+)(?:,(\d+))?/.exec(raw);
        if (match) right = Number(match[1]) - 1;
        continue;
      }
      if (raw.startsWith('\\')) continue;
      if (raw.startsWith('+')) { right += 1; lines.add(right); }
      else if (raw.startsWith('-')) continue;
      else if (raw.length > 0 || right > 0) right += 1;
    }
    result.set(file.path, lines);
  }
  return result;
}

export interface GitHubClient {
  getPullRequest(ref: PullRequestRef): Promise<PullRequestSnapshot>;
  listPullRequestFiles(ref: PullRequestRef): Promise<readonly PullRequestFile[]>;
  previewReview(ref: PullRequestRef, payload: ReviewPreview): ReviewPreview;
  publishReview(ref: PullRequestRef, payload: ReviewPreview): Promise<{ readonly reviewId: number; readonly url?: string }>;
  listOpenPullRequests(repository: { readonly owner: string; readonly repo: string }): Promise<readonly PullRequestSummary[]>;
  getCiStatus(ref: PullRequestRef, headSha: string, requiredChecks?: readonly string[]): Promise<CiStatus>;
  mergePullRequest(ref: PullRequestRef, headSha: string): Promise<{ readonly sha?: string; readonly url?: string }>;
}

export interface ReviewPreview { readonly commit_id: string; readonly event: 'COMMENT'; readonly body: string; readonly comments: readonly { readonly path: string; readonly line: number; readonly side: 'RIGHT' | 'LEFT'; readonly body: string }[]; }

export class GitHubApi implements GitHubClient {
  readonly #token?: string;
  readonly #fetch: typeof fetch;
  readonly #apiBase: string;
  constructor(token: string | undefined, fetcher: typeof fetch = fetch, apiBase = 'https://api.github.com') { this.#token = token; this.#fetch = fetcher; this.#apiBase = apiBase.replace(/\/$/, ''); }

  async getPullRequest(ref: PullRequestRef): Promise<PullRequestSnapshot> {
    const row = record(await this.#request(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${ref.number}`));
    const base = record(row.base); const head = record(row.head);
    return { ref, baseSha: string(base.sha), headSha: string(head.sha), title: string(row.title), body: row.body === null ? null : string(row.body), draft: row.draft === true, state: row.state === 'closed' ? 'closed' : 'open', mergeableState: typeof row.mergeable_state === 'string' ? row.mergeable_state : undefined };
  }

  async listOpenPullRequests(repository: { readonly owner: string; readonly repo: string }): Promise<readonly PullRequestSummary[]> {
    const result: PullRequestSummary[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const value = await this.#request(`/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/pulls?state=open&sort=updated&direction=desc&per_page=100&page=${page}`);
      if (!Array.isArray(value)) throw new Error('GitHub pull request response was not an array');
      for (const item of value) {
        const row = record(item); const head = record(row.head);
        const user = optionalRecord(row.user);
        result.push({ ref: { owner: repository.owner, repo: repository.repo, number: integer(row.number) }, headSha: string(head.sha), draft: row.draft === true, title: string(row.title), ...(typeof user.login === 'string' ? { authorLogin: user.login } : {}) });
      }
      if (value.length < 100) return result;
    }
    throw new Error('GitHub open pull request pagination exceeded safety limit');
  }

  async listPullRequestFiles(ref: PullRequestRef): Promise<readonly PullRequestFile[]> {
    const result: PullRequestFile[] = [];
    for (let page = 1; page <= 50; page += 1) {
      const value = await this.#request(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${ref.number}/files?per_page=100&page=${page}`);
      if (!Array.isArray(value)) throw new Error('GitHub files response was not an array');
      for (const item of value) { const row = record(item); result.push({ path: string(row.filename), status: string(row.status), additions: integer(row.additions), deletions: integer(row.deletions), patch: row.patch === undefined ? undefined : string(row.patch) }); }
      if (value.length < 100) return result;
    }
    throw new Error('GitHub pull request file pagination exceeded safety limit');
  }

  previewReview(_ref: PullRequestRef, payload: ReviewPreview): ReviewPreview { return payload; }

  async publishReview(ref: PullRequestRef, payload: ReviewPreview): Promise<{ readonly reviewId: number; readonly url?: string }> {
    if (!this.#token) throw new Error('GitHub publication requires a write token');
    const current = await this.getPullRequest(ref);
    if (current.headSha !== payload.commit_id) throw new Error(`PR head changed before publication: expected ${payload.commit_id}, found ${current.headSha}`);
    const row = record(await this.#request(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${ref.number}/reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }));
    return { reviewId: integer(row.id), url: typeof row.html_url === 'string' ? row.html_url : undefined };
  }


  async getCiStatus(ref: PullRequestRef, headSha: string, requiredChecks?: readonly string[]): Promise<CiStatus> {
    const [checksValue, statusValue] = await Promise.all([
      this.#request(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/commits/${encodeURIComponent(headSha)}/check-runs?per_page=100`),
      this.#request(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/commits/${encodeURIComponent(headSha)}/status`),
    ]);
    const checks = record(checksValue); const checkRuns = Array.isArray(checks.check_runs) ? checks.check_runs : [];
    const status = record(statusValue); const statuses = Array.isArray(status.statuses) ? status.statuses : [];
    const details: string[] = []; let pending = false; let failed = false;
    for (const value of checkRuns) { const row = record(value); const name = string(row.name); const conclusion = row.conclusion === null ? null : string(row.conclusion); details.push(`${name}:${conclusion ?? 'pending'}`); if (conclusion === null || row.status !== 'completed') pending = true; else if (conclusion !== 'success') failed = true; }
    for (const value of statuses) { const row = record(value); const context = string(row.context); const state = string(row.state); details.push(`${context}:${state}`); if (state === 'pending') pending = true; else if (state !== 'success') failed = true; }
    if (requiredChecks && requiredChecks.length > 0) {
      const observed = new Map<string, { readonly pending: boolean; readonly success: boolean }>();
      for (const value of checkRuns) { const row = record(value); const name = string(row.name); observed.set(name, { pending: row.conclusion === null || row.status !== 'completed', success: row.conclusion === 'success' && row.status === 'completed' }); }
      for (const value of statuses) { const row = record(value); const name = string(row.context); observed.set(name, { pending: row.state === 'pending', success: row.state === 'success' }); }
      for (const required of requiredChecks) {
        const state = observed.get(required);
        if (!state || state.pending) pending = true;
        else if (!state.success) failed = true;
      }
    }
    const count = checkRuns.length + statuses.length;
    return { ready: count > 0 && !pending && !failed, pending, failed, count, details };
  }

  async mergePullRequest(ref: PullRequestRef, headSha: string): Promise<{ readonly sha?: string; readonly url?: string }> {
    if (!this.#token) throw new Error('GitHub merge requires a write token');
    const current = await this.getPullRequest(ref);
    if (current.state !== 'open' || current.draft) throw new Error('pull request is not ready to merge');
    if (current.headSha !== headSha) throw new Error(`PR head changed before merge: expected ${headSha}, found ${current.headSha}`);
    if (current.mergeableState !== 'clean') throw new Error(`GitHub mergeable state is ${current.mergeableState ?? 'unknown'}`);
    const row = record(await this.#request(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${ref.number}/merge`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sha: headSha, merge_method: 'squash' }) }));
    if (row.merged !== true) throw new Error(typeof row.message === 'string' ? row.message : 'GitHub did not merge the pull request');
    return { sha: typeof row.sha === 'string' ? row.sha : undefined, url: typeof row.html_url === 'string' ? row.html_url : undefined };
  }

  async capturePullRequestSnapshot(ref: PullRequestRef): Promise<Snapshot> {
    const pr = await this.getPullRequest(ref);
    const fileList = await this.listPullRequestFiles(ref);
    const archiveUrl = `${this.#apiBase}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/tarball/${encodeURIComponent(pr.headSha)}`;
    let response = await this.#fetch(archiveUrl, { headers: { accept: 'application/vnd.github+json', ...(this.#token ? { authorization: `Bearer ${this.#token}` } : {}), 'user-agent': 'Black-Box-Reviewer' }, signal: AbortSignal.timeout(60_000), redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('GitHub archive redirect had no location');
      const redirected = new URL(location);
      if (redirected.hostname !== 'codeload.github.com' && redirected.hostname !== 'github.com') throw new Error(`GitHub archive redirect target is not allowlisted: ${redirected.hostname}`);
      response = await this.#fetch(redirected, { headers: { accept: 'application/octet-stream', 'user-agent': 'Black-Box-Reviewer' }, signal: AbortSignal.timeout(60_000), redirect: 'error' });
    }
    if (!response.ok) throw new Error(`GitHub archive returned HTTP ${response.status}`);
    const compressed = Buffer.from(await response.arrayBuffer());
    if (compressed.length > 128 * 1024 * 1024) throw new Error('GitHub archive exceeds 128 MiB safety limit');
    const files = parseTar(gunzipSync(compressed));
    const manifest = { mode: 'ref', baseRef: pr.baseSha, headSha: pr.headSha, files: files.map(({ path, sha256: hash, bytes, binary }) => ({ path, sha256: hash, bytes, binary })), changedPaths: fileList.map((file) => file.path).sort() };
    const manifestSha256 = sha256(stableJson(manifest));
    const snapshotId = id('snap', `${manifestSha256}:pr:${ref.owner}/${ref.repo}#${ref.number}`) as SnapshotId;
    return { id: snapshotId, mode: 'ref', root: `github://${ref.owner}/${ref.repo}/${pr.headSha}`, baseRef: pr.baseSha, headRef: pr.headSha, headSha: pr.headSha, files, changedPaths: manifest.changedPaths, omittedPaths: [], manifestSha256 };
  }

  async #request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.#fetch(`${this.#apiBase}${path}`, { ...init, headers: { accept: 'application/vnd.github+json', ...(this.#token ? { authorization: `Bearer ${this.#token}` } : {}), 'x-github-api-version': '2022-11-28', 'user-agent': 'Black-Box-Reviewer', ...(init.headers ?? {}) }, signal: init.signal ?? AbortSignal.timeout(30_000) });
    const text = await response.text();
    const value: unknown = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      let detail = '';
      try {
        const parsed = JSON.parse(text) as { message?: unknown };
        detail = typeof parsed.message === 'string' ? `: ${parsed.message}` : '';
      } catch { /* preserve the status when GitHub returns a non-JSON error */ }
      throw new Error(`GitHub API returned HTTP ${response.status}${detail}`);
    }
    return value;
  }
}

function parseTar(buffer: Buffer): SourceFile[] {
  const files: SourceFile[] = [];
  for (let offset = 0; offset + 512 <= buffer.length;) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = tarString(header.subarray(0, 100));
    const prefix = tarString(header.subarray(345, 500));
    const path = `${prefix ? `${prefix}/` : ''}${name}`;
    const size = parseOctal(header.subarray(124, 136));
    const type = header[156];
    const bodyStart = offset + 512;
    const bodyEnd = bodyStart + size;
    if (bodyEnd > buffer.length) throw new Error('GitHub archive has a truncated tar entry');
    if (path.split('/').includes('..') || path.startsWith('/') || path.includes('\\')) throw new Error('GitHub archive contains an unsafe path');
    if (type === 0 || type === 48) {
      const relativePath = path.split('/').slice(1).join('/');
      if (relativePath) {
        const bytes = buffer.subarray(bodyStart, bodyEnd);
        const binary = bytes.subarray(0, Math.min(bytes.length, 8_192)).includes(0);
        files.push({ path: relativePath, sha256: sha256(bytes), bytes: bytes.length, binary, content: binary ? '' : bytes.toString('utf8') });
      }
    } else if (type !== 5 && type !== 50 && type !== 53 && type !== 103 && type !== 120 && type !== 76 && type !== 75) {
      throw new Error(`GitHub archive contains unsupported entry type for ${path}`);
    }
    offset = bodyStart + Math.ceil(size / 512) * 512;
    if (files.length > 5_000) throw new Error('GitHub archive exceeds 5000 files');
  }
  return files;
}

function tarString(value: Buffer): string { return value.toString('utf8').replace(/\0.*$/, '').trim(); }
function parseOctal(value: Buffer): number { const text = tarString(value).replace(/\0/g, '').trim(); return text ? Number.parseInt(text, 8) : 0; }

function record(value: unknown): Record<string, unknown> { if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('GitHub response field was not an object'); return value as Record<string, unknown>; }
function optionalRecord(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function string(value: unknown): string { if (typeof value !== 'string') throw new Error('GitHub response field was not a string'); return value; }
function integer(value: unknown): number { if (!Number.isSafeInteger(value)) throw new Error('GitHub response field was not an integer'); return Number(value); }
import { gunzipSync } from 'node:zlib';
import { id, stableJson } from './hash.js';
import type { Snapshot, SnapshotId, SourceFile } from './types.js';
