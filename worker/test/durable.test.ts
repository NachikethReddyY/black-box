import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { URL } from 'node:url';
import { D1RequestStore } from '../src/db';
import { handleOperatorRequest, handleWebhook } from '../src/index';
import { githubSignatureForTests } from '../src/signature';
import { configFromEnv } from '../src/config';
import { tick, retryRequest } from '../src/orchestrator';
import type { GitHubApi, RequestRecord, WorkerEnv, WorkflowDispatchInput } from '../src/types';

// Exercise the actual SQL against SQLite; this adapter is not a D1 runtime claim.
function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_dispatch.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      let args: (string | number | null)[] = [];
      const query = {
        bind(...values: (string | number | null)[]) { args = values; return query; },
        async run() { const result = statement.run(...args); return { success: true, meta: { changes: Number(result.changes) } }; },
        async first() { return statement.get(...args) ?? null; },
        async all() { return { results: statement.all(...args), success: true }; },
      };
      return query;
    },
  } as unknown as D1Database;
  return { db, sqlite, store: new D1RequestStore(db) };
}
const head = 'a'.repeat(40), base = 'b'.repeat(40), merge = 'c'.repeat(40);
const envFor = (db: D1Database): WorkerEnv => ({ DB: db, WEBHOOK_SECRET: 'test-secret', TRUSTED_REPOSITORIES: 'acme/project', TRUSTED_ACTORS: 'owner', GITHUB_APP_ID: '1', GITHUB_APP_INSTALLATION_ID: '2', GITHUB_APP_PRIVATE_KEY: 'unused' });
const pr = { action: 'synchronize', sender: { login: 'owner' }, pull_request: { number: 7, head: { sha: head, ref: 'feature', repo: { full_name: 'acme/project' } }, base: { sha: base, ref: 'main', repo: { full_name: 'acme/project' } } } };
async function webhook(env: WorkerEnv, body = pr, delivery = crypto.randomUUID()) {
  const raw = JSON.stringify(body);
  return handleWebhook(new Request('https://blackbox.test/webhook', { method: 'POST', headers: { 'x-github-delivery': delivery, 'x-github-event': 'pull_request', 'x-hub-signature-256': await githubSignatureForTests(raw, env.WEBHOOK_SECRET) }, body: raw }), env);
}
function fixture() {
  const data = database();
  const env = envFor(data.db);
  let now = Date.now() + 5_000;
  const dispatches: WorkflowDispatchInput[] = [];
  const checks: { name: string; state: string; sha: string }[] = [];
  let checkId = 0;
  const github: GitHubApi = {
    async getPullRequest() { return { headSha: head, baseSha: base, mergeCommitSha: merge, mergeable: true, open: true }; },
    async listAvailableRunners() { return new Set(['home']); },
    async getBranchSha() { return head; },
    async dispatchWorkflow(input) { dispatches.push(input); return 42; },
    async findWorkflowRun() { return null; },
    async ensureCheck(request, name) { checks.push({ name, state: 'queued', sha: request.headSha }); return ++checkId; },
    async updateCheck(request, name, state) { checks.push({ name, state, sha: request.headSha }); },
  };
  const deps = { store: data.store, config: configFromEnv(env), github, now: () => now };
  return { ...data, env, deps, github, dispatches, checks, advance() { now += 180_000; } };
}

test('signed PR persists before acknowledgement and deduplicates after store reconstruction', async () => {
  const f = fixture();
  const delivery = crypto.randomUUID();
  assert.equal((await webhook(f.env, pr, delivery)).status, 202);
  assert.equal((await webhook(f.env, pr, delivery)).status, 202);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM requests').get()?.n, 1);
  const saved = await new D1RequestStore(f.db).findByEvent(delivery);
  assert.equal(saved?.mergeReady, false);
  assert.equal(saved?.sourceRef, 'refs/pull/7/merge');
  assert.equal(saved?.sourceEvent, 'pull_request');
  f.sqlite.close();
});
test('operator endpoint persists a manual request only with its token and deduplicates idempotency keys', async () => {
  const f = fixture();
  const env = { ...f.env, OPERATOR_TOKEN: 'operator-secret' } satisfies WorkerEnv;
  const body = JSON.stringify({ repository: 'acme/project', source_ref: 'refs/heads/main', commit_sha: head, idempotency_key: 'agent-run-1' });
  const make = (authorization?: string) => handleOperatorRequest(new Request('https://blackbox.test/requests', { method: 'POST', headers: { Authorization: authorization ?? '', 'content-type': 'application/json' }, body }), env);
  assert.equal((await make()).status, 401);
  const first = await make('Bearer operator-secret');
  const second = await make('Bearer operator-secret');
  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  assert.equal((await first.json() as { status: string }).status, 'created');
  assert.equal((await second.json() as { status: string }).status, 'duplicate');
  const saved = await f.store.findByEvent('manual:acme/project:agent-run-1');
  assert.equal(saved?.sourceEvent, 'manual');
  assert.equal(saved?.commitSha, head);
  f.sqlite.close();
});
test('manual requests dispatch their pinned SHA without branch freshness checks', async () => {
  const f = fixture();
  const row = {
    requestId: crypto.randomUUID(), eventId: 'manual:acme/project:manual-2', repository: 'acme/project', actor: 'operator', sourceEvent: 'manual' as const,
    workflowFile: 'black-box-ci.yml', workflowRef: 'main', sourceRef: 'refs/heads/feature', prNumber: '', commitSha: head, headSha: head, baseSha: base,
    mergeReady: true, runner: 'waiting' as const,
  };
  await f.store.insertPending(row, Date.now());
  f.github.getBranchSha = async () => { throw new Error('manual_requests_must_not_resolve_branch'); };
  await tick(f.deps);
  assert.equal(f.dispatches.length, 1);
  assert.equal(f.dispatches[0].inputs.commit_sha, head);
  f.sqlite.close();
});
test('unknown actor and fork code never enter the queue', async () => {
  const f = fixture();
  assert.equal((await webhook(f.env, { ...pr, sender: { login: 'outsider' } })).status, 403);
  assert.equal((await webhook(f.env, { ...pr, pull_request: { ...pr.pull_request, head: { ...pr.pull_request.head, repo: { full_name: 'outsider/fork' } } } })).status, 403);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM requests').get()?.n, 0);
  f.sqlite.close();
});
test('unresolved merge and busy home stay durable and queued, then resume once ready', async () => {
  const f = fixture();
  await webhook(f.env);
  f.github.getPullRequest = async () => ({ headSha: head, baseSha: base, mergeCommitSha: null, mergeable: null, open: true });
  await tick(f.deps);
  assert.equal(f.dispatches.length, 0);
  assert.equal(f.checks.filter(x => x.state === 'queued').length, 4);
  f.github.getPullRequest = async () => ({ headSha: head, baseSha: base, mergeCommitSha: merge, mergeable: true, open: true });
  f.github.listAvailableRunners = async () => new Set(['waiting']);
  f.advance(); await tick(f.deps); assert.equal(f.dispatches.length, 0);
  f.github.listAvailableRunners = async () => new Set(['home']);
  f.advance(); await tick(f.deps);
  assert.equal(f.dispatches.length, 1);
  assert.equal(f.dispatches[0].inputs.commit_sha, merge);
  f.sqlite.close();
});
test('overlapping cron invocations dispatch once; timeout never automatically redispatches', async () => {
  const f = fixture();
  await webhook(f.env);
  f.github.dispatchWorkflow = async input => { f.dispatches.push(input); throw new Error('timeout'); };
  await Promise.all([tick(f.deps), tick(f.deps)]);
  assert.equal(f.dispatches.length, 1);
  f.advance(); await tick(f.deps); assert.equal(f.dispatches.length, 1);
  const row = f.sqlite.prepare('SELECT request_id FROM requests').get();
  await assert.rejects(() => retryRequest(String(row?.request_id), f.deps), /unresolved/);
  assert.equal(f.dispatches.length, 1);
  f.sqlite.close();
});
test('stale PR result cannot publish success', async () => {
  const f = fixture(); await webhook(f.env); await tick(f.deps);
  f.github.getPullRequest = async () => ({ headSha: 'd'.repeat(40), baseSha: base, mergeCommitSha: 'e'.repeat(40), mergeable: true, open: true });
  f.github.findWorkflowRun = async request => ({ id: 42, attempt: 1, status: 'completed', conclusion: 'success', htmlUrl: 'https://github.com/acme/project/actions/runs/42', jobs: Object.fromEntries(['local-checks','local-postgres','source-and-dependencies','dast-tooling'].map(name => [name, { conclusion: 'success', checkoutVerified: true }])) });
  f.advance(); await tick(f.deps);
  assert.equal(f.checks.some(x => x.state === 'success'), false);
  assert.equal(f.sqlite.prepare('SELECT state FROM requests').get()?.state, 'superseded');
  f.sqlite.close();
});
