export interface PullRequestRef { readonly owner: string; readonly repo: string; readonly number: number; }
export interface PullRequestSnapshot { readonly ref: PullRequestRef; readonly baseSha: string; readonly headSha: string; readonly title: string; readonly body: string | null; }
export interface PullRequestFile { readonly path: string; readonly status: string; readonly additions: number; readonly deletions: number; readonly patch?: string; }

export interface GitHubClient {
  getPullRequest(ref: PullRequestRef): Promise<PullRequestSnapshot>;
  listPullRequestFiles(ref: PullRequestRef): Promise<readonly PullRequestFile[]>;
  previewReview(ref: PullRequestRef, payload: ReviewPreview): ReviewPreview;
}

export interface ReviewPreview { readonly commit_id: string; readonly event: 'COMMENT'; readonly body: string; readonly comments: readonly { readonly path: string; readonly line: number; readonly side: 'RIGHT' | 'LEFT'; readonly body: string }[]; }

export class GitHubApi implements GitHubClient {
  readonly #token: string;
  readonly #fetch: typeof fetch;
  readonly #apiBase: string;
  constructor(token: string, fetcher: typeof fetch = fetch, apiBase = 'https://api.github.com') { this.#token = token; this.#fetch = fetcher; this.#apiBase = apiBase.replace(/\/$/, ''); }

  async getPullRequest(ref: PullRequestRef): Promise<PullRequestSnapshot> {
    const row = record(await this.#request(`/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${ref.number}`));
    const base = record(row.base); const head = record(row.head);
    return { ref, baseSha: string(base.sha), headSha: string(head.sha), title: string(row.title), body: row.body === null ? null : string(row.body) };
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

  async capturePullRequestSnapshot(ref: PullRequestRef): Promise<Snapshot> {
    const pr = await this.getPullRequest(ref);
    const fileList = await this.listPullRequestFiles(ref);
    const response = await this.#fetch(`${this.#apiBase}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/tarball/${encodeURIComponent(pr.headSha)}`, { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${this.#token}`, 'user-agent': 'Black-Box-Reviewer' }, signal: AbortSignal.timeout(60_000), redirect: 'error' });
    if (!response.ok) throw new Error(`GitHub archive returned HTTP ${response.status}`);
    const compressed = Buffer.from(await response.arrayBuffer());
    if (compressed.length > 128 * 1024 * 1024) throw new Error('GitHub archive exceeds 128 MiB safety limit');
    const files = parseTar(gunzipSync(compressed));
    const manifest = { mode: 'ref', baseRef: pr.baseSha, headSha: pr.headSha, files: files.map(({ path, sha256: hash, bytes, binary }) => ({ path, sha256: hash, bytes, binary })), changedPaths: fileList.map((file) => file.path).sort() };
    const manifestSha256 = sha256(stableJson(manifest));
    const snapshotId = id('snap', `${manifestSha256}:pr:${ref.owner}/${ref.repo}#${ref.number}`) as SnapshotId;
    return { id: snapshotId, mode: 'ref', root: `github://${ref.owner}/${ref.repo}/${pr.headSha}`, baseRef: pr.baseSha, headRef: pr.headSha, headSha: pr.headSha, files, changedPaths: manifest.changedPaths, omittedPaths: [], manifestSha256 };
  }

  async #request(path: string): Promise<unknown> {
    const response = await this.#fetch(`${this.#apiBase}${path}`, { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${this.#token}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'Black-Box-Reviewer' }, signal: AbortSignal.timeout(30_000) });
    const value: unknown = await response.json();
    if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status}`);
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
    } else if (type !== 5 && type !== 50) {
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
function string(value: unknown): string { if (typeof value !== 'string') throw new Error('GitHub response field was not a string'); return value; }
function integer(value: unknown): number { if (!Number.isSafeInteger(value)) throw new Error('GitHub response field was not an integer'); return Number(value); }
import { gunzipSync } from 'node:zlib';
import { id, sha256, stableJson } from './hash.js';
import type { Snapshot, SnapshotId, SourceFile } from './types.js';
