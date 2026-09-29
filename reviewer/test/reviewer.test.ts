import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { configFromEnv, parseDotEnv } from '../src/config.js';
import { buildContext } from '../src/context.js';
import { id } from '../src/hash.js';
import { FakeProvider } from '../src/provider.js';
import { runReview } from '../src/pipeline.js';
import { reportMarkdown } from '../src/report.js';
import { captureSnapshot } from '../src/snapshot.js';
import { ReviewStore } from '../src/store.js';
import type { Candidate, ProviderResponse, ReviewConfig, ReviewId } from '../src/types.js';
import { tempRepo, run } from './helpers.js';
import { GitHubApi } from '../src/github.js';

function config(root: string, extra: Partial<ReviewConfig> = {}): ReviewConfig {
  return { root, dataDir: mkdtempSync(join(tmpdir(), 'blackbox-reviewer-data-')), profile: 'static_only', maxAttempts: 4, maxInputTokens: 32_768, maxOutputTokens: 16_384, maxPacketBytes: 128 * 1024, maxInlineFindings: 5, cloudBudgetUsd: 0, ...extra };
}

test('parses dotenv with spaces without exposing values', () => {
  const parsed = parseDotEnv('LUNA_API_KEY = secret\n# ignored\nBAD KEY=nope\n');
  assert.deepEqual(parsed, { LUNA_API_KEY: 'secret' });
});

test('working-tree and staged snapshots capture different immutable bytes', () => {
  const root = tempRepo();
  writeFileSync(join(root, 'index.ts'), 'export function value(): number { return 2; }\n');
  run(root, ['add', 'index.ts']);
  writeFileSync(join(root, 'index.ts'), 'export function value(): number { return 3; }\n');
  const staged = captureSnapshot(config(root), 'staged');
  const working = captureSnapshot(config(root), 'working_tree');
  assert.notEqual(staged.id, working.id);
  assert.match(staged.files.find((file) => file.path === 'index.ts')?.content ?? '', /return 2/);
  assert.match(working.files.find((file) => file.path === 'index.ts')?.content ?? '', /return 3/);
  assert.equal(staged.headSha, null);
  assert.equal(working.headSha, null);
});

test('context includes TypeScript symbols and blocks a secret-bearing cloud packet', () => {
  const root = tempRepo();
  writeFileSync(join(root, 'index.ts'), 'export function value(): number { return 2; }\nconst token = "sk-test-1234567890123456";\n');
  const snap = captureSnapshot(config(root), 'working_tree');
  const built = buildContext(snap, 128 * 1024);
  assert.ok(built.packet.symbols.some((symbol) => symbol.name === 'value'));
  assert.equal(built.redaction.findings.length, 1);
  assert.doesNotMatch(built.packet.files.find((file) => file.path === 'index.ts')?.content ?? '', /sk-test/);
  const store = new ReviewStore(config(root));
  return runReview(config(root, { profile: 'economy_cloud_luna_v1', cloudBudgetUsd: 0.03 }), snap, built.packet, store, { authorizeCloud: true, provider: new FakeProvider() }).then((result) => {
    assert.equal(result.outcome, 'incomplete');
    assert.equal(result.attempts, 0);
    store.close();
  });
});

test('static review persists an exact result and publication preview without a model call', async () => {
  const root = tempRepo();
  const cfg = config(root);
  const snap = captureSnapshot(cfg, 'ref', 'HEAD');
  const built = buildContext(snap, cfg.maxPacketBytes);
  const store = new ReviewStore(cfg);
  const result = await runReview(cfg, snap, built.packet, store);
  assert.equal(result.outcome, 'completed_clean');
  assert.equal(result.attempts, 0);
  assert.ok(store.getReview(result.reviewId));
  assert.match(reportMarkdown(result), /Outcome: \*\*completed_clean\*\*/);
  store.close();
});

function candidate(): Candidate {
  return { candidateId: 'candidate-1', category: 'correctness', severity: 'high', title: 'returns the wrong value', trigger: 'the changed return path is selected', expected: 'the caller receives the stored value', actual: 'the caller receives a constant', impact: 'caller behavior is incorrect', changeRelevance: 'introduced', causalChangeRef: [{ path: 'index.ts', sha256: 'source', start: 1, end: 1, side: 'RIGHT', reason: 'changed return' }], evidence: [{ path: 'index.ts', sha256: 'source', start: 1, end: 1, side: 'RIGHT', reason: 'changed return' }], verificationKind: 'model_assessment', status: 'candidate' };
}

test('cloud pipeline uses two specialists and one verifier, then publishes only supported causal findings', async () => {
  const root = tempRepo();
  const cfg = config(root, { profile: 'economy_cloud_luna_v1', cloudBudgetUsd: 0.03 });
  const snap = captureSnapshot(cfg, 'ref', 'HEAD');
  const built = buildContext(snap, cfg.maxPacketBytes);
  const responses: ProviderResponse[] = [
    { candidates: [candidate()], inputTokens: 100, outputTokens: 100, rawStatus: 'ok' },
    { candidates: [candidate()], inputTokens: 100, outputTokens: 100, rawStatus: 'ok' },
    { verifications: [{ candidateId: 'candidate-1', decision: 'supported', evidenceChecked: ['index.ts'], causalLink: 'introduced', verificationKind: 'model_assessment', reason: 'causal evidence matches changed code', uncertainty: 'no runtime reproduction' }], inputTokens: 100, outputTokens: 100, rawStatus: 'ok' },
  ];
  const provider = new FakeProvider(responses);
  const store = new ReviewStore(cfg);
  const result = await runReview(cfg, snap, built.packet, store, { authorizeCloud: true, provider });
  assert.equal(result.outcome, 'completed_findings');
  assert.equal(result.attempts, 3);
  assert.equal(result.findings.length, 1);
  assert.equal(provider.requests.length, 3);
  assert.equal(provider.requests[2]?.role, 'verifier');
  assert.equal(result.findings[0]?.verification.verificationKind, 'model_assessment');
  store.close();
});

test('verifier output cannot claim runtime proof or omit a candidate', async () => {
  const root = tempRepo();
  const cfg = config(root, { profile: 'economy_cloud_luna_v1', cloudBudgetUsd: 0.03 });
  const snap = captureSnapshot(cfg, 'ref', 'HEAD');
  const built = buildContext(snap, cfg.maxPacketBytes);
  const invalid: ProviderResponse[] = [
    { candidates: [candidate()], inputTokens: 1, outputTokens: 1, rawStatus: 'ok' },
    { candidates: [], inputTokens: 1, outputTokens: 1, rawStatus: 'ok' },
    { verifications: [], inputTokens: 1, outputTokens: 1, rawStatus: 'ok' },
  ];
  const store = new ReviewStore(cfg);
  const result = await runReview(cfg, snap, built.packet, store, { authorizeCloud: true, provider: new FakeProvider(invalid) });
  assert.equal(result.outcome, 'incomplete');
  assert.match(result.error ?? '', /verifier omitted/);
  store.close();
});

test('config defaults to static-only even when API keys exist', () => {
  const cfg = configFromEnv({ LUNA_API_KEY: 'present', SPAN_API_KEY: 'present' }, '/tmp');
  assert.equal(cfg.profile, 'static_only');
  assert.equal(cfg.cloudBudgetUsd, 0);
});

test('GitHub adapter validates PR metadata and paginates files through an injected transport', async () => {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith('/pulls/7')) return new Response(JSON.stringify({ base: { sha: 'base' }, head: { sha: 'head' }, title: 'Fixture', body: null }), { status: 200 });
    if (url.includes('page=1')) return new Response(JSON.stringify([{ filename: 'index.ts', status: 'modified', additions: 1, deletions: 0, patch: '@@' }]), { status: 200 });
    throw new Error(`unexpected request ${url}`);
  };
  const api = new GitHubApi('fake-token', fetcher, 'https://github.test');
  const ref = { owner: 'owner', repo: 'repo', number: 7 };
  const pr = await api.getPullRequest(ref);
  const files = await api.listPullRequestFiles(ref);
  assert.equal(pr.headSha, 'head');
  assert.equal(files[0]?.path, 'index.ts');
  assert.equal(requests.length, 2);
  assert.ok(requests.every((url) => url.startsWith('https://github.test/')));
});
