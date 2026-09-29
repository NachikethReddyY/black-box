import { createInstallationToken } from './auth';
import type { DispatcherConfig, GitHubApi, RequestRecord, Runner, WorkerEnv, WorkflowDispatchInput, WorkflowRun, JobResult } from './types';
export function object(value: unknown): Record<string, unknown> | null { return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null; }
export function exactSha(value: unknown): string | null { return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : null; }
export function runnerHasRequiredLabels(labels: readonly unknown[], homeRunnerLabel: string): boolean {
  const normalized = new Set(labels.filter((label): label is string => typeof label === 'string').map(label => label.toLowerCase()));
  return ['self-hosted', 'linux', 'x64', homeRunnerLabel.toLowerCase()].every(label => normalized.has(label));
}
export function workflowDispatchInput(_config: DispatcherConfig, r: RequestRecord): WorkflowDispatchInput {
  if (r.runner === 'waiting' || !r.mergeReady) throw new Error('request_not_dispatchable');
  return { ref: r.workflowRef, inputs: { runner: r.runner, commit_sha: r.commitSha, head_sha: r.headSha, request_id: r.requestId, source_ref: r.sourceRef, pr_number: r.prNumber, source_event: r.sourceEvent } };
}
export function validateRun(value: unknown, r: RequestRecord): WorkflowRun | null {
  const row = object(value);
  const expectedPath = `.github/workflows/${r.workflowFile}`;
  const pathMatches = typeof row?.path === 'string' && (row.path === expectedPath || row.path.startsWith(`${expectedPath}@`));
  const refMatches = row?.head_branch === undefined || row.head_branch === null || row.head_branch === r.workflowRef;
  if (!row || !Number.isSafeInteger(row.id) || typeof row.id !== 'number' || typeof row.status !== 'string' || row.event !== 'workflow_dispatch' || row.display_title !== `black-box:${r.requestId}` || !pathMatches || !refMatches || typeof row.run_attempt !== 'number') return null;
  if (r.workflowRunId && row.id !== r.workflowRunId) return null;
  return { id: row.id, attempt: row.run_attempt, status: row.status, conclusion: typeof row.conclusion === 'string' ? row.conclusion : null, htmlUrl: `https://github.com/${r.repository}/actions/runs/${row.id}`, jobs: {} };
}
export function createGitHubApi(env: WorkerEnv, config: DispatcherConfig, fetcher: typeof fetch = fetch): GitHubApi {
  // One short-lived installation token per reconciliation pass, never in D1.
  let token: Promise<string> | undefined;
  const path = (repo: string, suffix: string) => `/repos/${repo.split('/').map(encodeURIComponent).join('/')}/${suffix}`;
  async function request(suffix: string, init: RequestInit = {}) {
    token ??= createInstallationToken(env, 'https://api.github.com', fetcher);
    return fetcher(`https://api.github.com${suffix}`, { ...init, signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${await token}`, 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'Black-Box-CI', 'Content-Type': 'application/json', ...init.headers } });
  }
  async function json(suffix: string) { const response = await request(suffix); if (!response.ok) throw new Error(`github_http_${response.status}`); return object(await response.json()); }
  async function list(suffix: string, key: string): Promise<unknown[]> {
    const rows: unknown[] = [];
    for (let page = 1; page <= 5; page++) {
      const payload = await json(`${suffix}${suffix.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      const items = payload?.[key]; if (!Array.isArray(items)) throw new Error('invalid_github_list');
      rows.push(...items); if (items.length < 100) return rows;
    }
    throw new Error('github_pagination_limit_requires_operator');
  }
  return {
    async dispatchWorkflow(input, repo, workflowFile) {
      const response = await request(path(repo, `actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`), { method: 'POST', body: JSON.stringify(input) });
      if (response.status === 204) return undefined;
      if (!response.ok) throw new Error(`dispatch_http_${response.status}`);
      const payload = object(await response.json());
      return typeof payload?.workflow_run_id === 'number' ? payload.workflow_run_id : undefined;
    },
    async findWorkflowRun(r) {
      const candidates = r.workflowRunId ? [await json(path(r.repository, `actions/runs/${r.workflowRunId}`))] : await list(path(r.repository, `actions/workflows/${encodeURIComponent(r.workflowFile)}/runs?event=workflow_dispatch&created=${encodeURIComponent('>=' + new Date(r.createdAt - 60_000).toISOString())}`), 'workflow_runs');
      const matches = candidates.map(x => validateRun(x, r)).filter((x): x is WorkflowRun => x !== null);
      if (matches.length > 1) throw new Error('multiple_runs_require_operator');
      const run = matches[0]; if (!run) return null;
      if (run.status !== 'completed') return run;
      const jobs: Record<string, JobResult> = {};
      const rows = await list(path(r.repository, `actions/runs/${run.id}/attempts/${run.attempt}/jobs`), 'jobs');
      for (const raw of rows) {
        const row = object(raw); if (!row || typeof row.name !== 'string') throw new Error('invalid_job');
        if (jobs[row.name]) throw new Error('duplicate_job_name');
        const verified = Array.isArray(row.steps) && row.steps.some(step => { const s = object(step); return s?.name === 'Verify exact checkout' && s.conclusion === 'success'; });
        jobs[row.name] = { conclusion: typeof row.conclusion === 'string' ? row.conclusion : null, checkoutVerified: verified };
      }
      return { ...run, jobs };
    },
    async ensureCheck(r, name) {
      const externalId = `${r.requestId}:${name}`;
      const rows = await list(path(r.repository, `commits/${r.headSha}/check-runs?check_name=${encodeURIComponent(name)}&filter=all`), 'check_runs');
      const existing = rows.map(object).find(x => x?.external_id === externalId && x.head_sha === r.headSha && String(object(x.app)?.id) === env.GITHUB_APP_ID);
      if (typeof existing?.id === 'number') return existing.id;
      const response = await request(path(r.repository, 'check-runs'), { method: 'POST', body: JSON.stringify({ name, head_sha: r.headSha, external_id: externalId, status: 'queued', output: { title: name, summary: 'Waiting for Black Box. No test result has been reported.' } }) });
      if (!response.ok) throw new Error(`check_http_${response.status}`);
      const created = object(await response.json()); if (typeof created?.id !== 'number') throw new Error('invalid_check_response'); return created.id;
    },
    async updateCheck(r, name, state, summary, detailsUrl) {
      const id = r.checks[name]; if (!id) throw new Error('missing_check_id');
      const active = state === 'queued' || state === 'in_progress';
      const response = await request(path(r.repository, `check-runs/${id}`), { method: 'PATCH', body: JSON.stringify({ status: active ? state : 'completed', conclusion: active ? undefined : state, details_url: detailsUrl, output: { title: name, summary } }) });
      if (!response.ok) throw new Error(`check_update_http_${response.status}`);
    },
    async getPullRequest(repo, number) {
      const row = await json(path(repo, `pulls/${number}`));
      const head = object(row?.head), base = object(row?.base);
      const headSha = exactSha(head?.sha), baseSha = exactSha(base?.sha);
      if (!headSha || !baseSha || String(object(head?.repo)?.full_name).toLowerCase() !== repo || String(object(base?.repo)?.full_name).toLowerCase() !== repo) throw new Error('invalid_or_untrusted_pull_request');
      return { headSha, baseSha, mergeCommitSha: exactSha(row?.merge_commit_sha), mergeable: typeof row?.mergeable === 'boolean' ? row.mergeable : null, open: row?.state === 'open' };
    },
    async listAvailableRunners(repo) {
      const available = new Set<Runner>(['waiting']);
      let online = false;
      // API errors and incomplete inventory must never imply permission to spend.
      const rows = await list(path(repo, 'actions/runners'), 'runners');
      for (const raw of rows) {
        const r = object(raw);
        if (!r || !Array.isArray(r.labels)) throw new Error('invalid_runner_inventory');
        const labels = r.labels.map(x => object(x)?.name);
        if (!runnerHasRequiredLabels(labels, config.homeRunnerLabel) || r.status !== 'online') continue;
        online = true; if (r.busy === false) available.add('home');
      }
      if (!online && config.paidFallbacksEnabled) {
        for (const provider of config.runnerOrder) if (provider === 'github' || provider === 'blacksmith') available.add(provider);
      }
      return available;
    },
    async getBranchSha(repo, branch) {
      const row = await json(path(repo, `git/ref/heads/${encodeURIComponent(branch)}`));
      const sha = exactSha(object(row?.object)?.sha); if (!sha) throw new Error('invalid_branch_sha'); return sha;
    },
  };
}
