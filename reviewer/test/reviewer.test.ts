import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { configFromEnv, parseDotEnv } from '../src/config.js';
import { buildContext } from '../src/context.js';
import { id, sha256 } from '../src/hash.js';
import { createResponsesProvider, FakeProvider, OPENAI_ROUTE, ResponsesProvider, TOKENROUTER_ROUTE } from '../src/provider.js';
import { runReview } from '../src/pipeline.js';
import { reportMarkdown } from '../src/report.js';
import { captureSnapshot } from '../src/snapshot.js';
import { ReviewStore } from '../src/store.js';
import type { Candidate, FindingId, ProviderResponse, ReviewConfig, ReviewId } from '../src/types.js';
import { tempRepo, run } from './helpers.js';
import { changedRightLines, GitHubApi } from '../src/github.js';
import { assessMergeability, buildReviewPreview } from '../src/publisher.js';
import { mergeSummaryBody, SUMMARY_END, SUMMARY_START, summaryCoversHead } from '../src/publisher.js';
import { listenStatusServer } from '../src/status-server.js';
import { createGitHubAppJwt, createGitHubInstallationToken, githubAppCredentials } from '../src/github-app.js';
import { AutomaticReviewer } from '../src/automation.js';

function config(root: string, extra: Partial<ReviewConfig> = {}): ReviewConfig {
  return { root, dataDir: mkdtempSync(join(tmpdir(), 'blackbox-reviewer-data-')), profile: 'static_only', maxAttempts: 4, maxInputTokens: 32_768, maxOutputTokens: 16_384, maxPacketBytes: 128 * 1024, maxInlineFindings: 5, cloudBudgetUsd: 0, githubRepositories: [], pollIntervalMs: 60_000, includeDrafts: false, maxAutomaticReviewsPerPoll: 1, ...extra };
}

test('parses dotenv with spaces without exposing values', () => {
  const parsed = parseDotEnv('LUNA_API_KEY = secret\n# ignored\nBAD KEY=nope\n');
  assert.deepEqual(parsed, { LUNA_API_KEY: 'secret' });
});

test('automatic polling configuration is explicit and safe by default', () => {
  const cfg = configFromEnv({ REVIEWER_GITHUB_REPOSITORIES: 'NachikethReddyY/black-box', REVIEWER_POLL_INTERVAL_SECONDS: '30', REVIEWER_INCLUDE_DRAFTS: 'true' }, '/tmp');
  assert.deepEqual(cfg.githubRepositories, [{ owner: 'NachikethReddyY', repo: 'black-box' }]);
  assert.equal(cfg.pollIntervalMs, 30_000);
  assert.equal(cfg.includeDrafts, true);
  assert.equal(cfg.maxAutomaticReviewsPerPoll, 1);
  assert.equal(cfg.maxInputTokens, 131_072);
  assert.equal(cfg.maxPacketBytes, 600 * 1024);
  assert.deepEqual(cfg.requiredCiChecks, ['reviewer']);
  assert.equal(configFromEnv({ REVIEWER_PR_NUMBER: '7' }, '/tmp').automaticPullRequestNumber, 7);
  assert.throws(() => configFromEnv({ REVIEWER_GITHUB_REPOSITORIES: 'owner/repo/extra' }, '/tmp'), /invalid/);
  assert.throws(() => configFromEnv({ REVIEWER_POLL_INTERVAL_SECONDS: '10' }, '/tmp'), /at least 15/);
  assert.throws(() => configFromEnv({ LUNA_API_KEY: 'router-key', REVIEWER_MAX_ATTEMPTS: '2' }, '/tmp'), /at least three attempts/);
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
  const fixtureToken = ['sk', 'test', '1234567890123456'].join('-');
  writeFileSync(join(root, 'index.ts'), `export function value(): number { return 2; }\nconst token = "${fixtureToken}";\n`);
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

test('coverage tracks changed files instead of unrelated repository context', () => {
  const root = tempRepo();
  writeFileSync(join(root, 'changed.ts'), 'export const changed = 1;\n');
  writeFileSync(join(root, 'unchanged.ts'), 'export const unchanged = 1;\n');
  run(root, ['add', 'changed.ts', 'unchanged.ts']);
  run(root, ['commit', '-m', 'fixture']);
  writeFileSync(join(root, 'changed.ts'), 'export const changed = 2;\n');

  const snapshot = captureSnapshot(config(root), 'working_tree');
  const { packet } = buildContext(snapshot, 128 * 1024);

  assert.deepEqual(snapshot.changedPaths, ['changed.ts']);
  assert.deepEqual(packet.omittedPaths, []);
  assert.deepEqual(packet.files.map((file) => file.path), ['changed.ts']);

  const store = new ReviewStore(config(root));
  return runReview(config(root), snapshot, packet, store).then((result) => {
    assert.equal(result.coverage.complete, true);
    assert.deepEqual(result.coverage.selectedPaths, ['changed.ts']);
    assert.deepEqual(result.coverage.omittedPaths, []);
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
  const second = await runReview(cfg, snap, built.packet, store);
  assert.notEqual(second.reviewId, result.reviewId);
  assert.equal(store.listReviews().length, 2);
  assert.match(reportMarkdown(result), /Outcome: \*\*completed_clean\*\*/);
  store.close();
});

test('automatic head claims are durable and suppress duplicate polling', () => {
  const cfg = config(tempRepo());
  const store = new ReviewStore(cfg);
  assert.equal(store.claimAutomaticHead('owner', 'repo', 1, 'head', 60_000, 1_000), true);
  assert.equal(store.claimAutomaticHead('owner', 'repo', 1, 'head', 60_000, 1_001), false);
  store.completeAutomaticHead('owner', 'repo', 1, 'head', 'completed', 'review-1', 60_000, 1_002);
  assert.equal(store.claimAutomaticHead('owner', 'repo', 1, 'head', 60_000, 1_003), false);
  assert.equal(store.claimAutomaticHead('owner', 'repo', 1, 'new-head', 60_000, 1_004), true);
  store.close();
});

test('expired automatic leases cannot complete after a replacement worker claims the head', () => {
  const cfg = config(tempRepo());
  const store = new ReviewStore(cfg);
  const first = store.claimAutomaticLease('owner', 'repo', 1, 'head', 60_000, 1_000);
  assert.equal(first, 1);
  assert.equal(store.claimAutomaticLease('owner', 'repo', 1, 'head', 60_000, 1_001), undefined);
  const replacement = store.claimAutomaticLease('owner', 'repo', 1, 'head', 60_000, 61_001);
  assert.equal(replacement, 2);
  store.completeAutomaticHead('owner', 'repo', 1, 'head', 'completed', 'stale-review', 60_000, 61_002, first);
  assert.equal(store.getAutomaticHead('owner', 'repo', 1, 'head')?.status, 'processing');
  store.completeAutomaticHead('owner', 'repo', 1, 'head', 'completed', 'replacement-review', 60_000, 61_003, replacement);
  assert.equal(store.getAutomaticHead('owner', 'repo', 1, 'head')?.reviewId, 'replacement-review');
  store.close();
});

test('automatic polling skips drafts, reviews one new head, and suppresses it on the next poll', async () => {
  const root = tempRepo();
  const cfg = config(root, { profile: 'static_only', githubRepositories: [{ owner: 'owner', repo: 'repo' }], includeDrafts: false, maxAutomaticReviewsPerPoll: 1 });
  const snapshot = captureSnapshot(cfg, 'ref', 'HEAD');
  const requests: string[] = [];
  const client = {
    async getPullRequest() { return { headSha: 'ready-head', body: null, draft: false, state: 'open' as const, mergeableState: 'blocked' }; },
    async listOpenPullRequests() { return [{ ref: { owner: 'owner', repo: 'repo', number: 1 }, headSha: 'draft-head', draft: true, title: 'Draft', authorLogin: 'owner' }, { ref: { owner: 'owner', repo: 'repo', number: 2 }, headSha: 'ready-head', draft: false, title: 'Ready', authorLogin: 'owner' }]; },
    async capturePullRequestSnapshot() { return { ...snapshot, headSha: 'ready-head', changedPaths: ['index.ts'] }; },
    async listPullRequestFiles() { return [{ path: 'index.ts', status: 'modified', additions: 1, deletions: 0, patch: '@@ -1 +1 @@\n+changed' }]; },
    async publishReview(_ref: unknown, payload: { commit_id: string }) { requests.push(payload.commit_id); return { reviewId: 99 }; },
    async updatePullRequestBody() {},
    async getCiStatus() { return { ready: false, pending: true, failed: false, count: 1, details: ['ci:pending'] }; },
    async mergePullRequest() { throw new Error('must not merge in fixture'); },
  };
  const store = new ReviewStore(cfg);
  const reviewer = new AutomaticReviewer(cfg, store, client);
  const first = await reviewer.pollOnce();
  assert.deepEqual(first, { discovered: 2, skippedDrafts: 1, skippedProcessed: 0, reviewed: 1, published: 1, summaries: 0, merged: 0, waitingForCi: 0, failed: 0 });
  const second = await reviewer.pollOnce();
  assert.deepEqual(second, { discovered: 2, skippedDrafts: 1, skippedProcessed: 1, reviewed: 0, published: 0, summaries: 0, merged: 0, waitingForCi: 0, failed: 0 });
  assert.deepEqual(requests, ['ready-head']);
  store.close();
});

test('automatic polling backs off an incomplete review instead of marking it complete', async () => {
  const root = tempRepo();
  const cfg = config(root, { profile: 'economy_cloud_luna_v1', cloudBudgetUsd: 0.10, githubRepositories: [{ owner: 'owner', repo: 'repo' }] });
  const snapshot = captureSnapshot(cfg, 'ref', 'HEAD');
  const client = {
    async getPullRequest() { return { headSha: snapshot.headSha ?? 'head', body: null, draft: false, state: 'open' as const, mergeableState: 'blocked' }; },
    async listOpenPullRequests() { return [{ ref: { owner: 'owner', repo: 'repo', number: 1 }, headSha: snapshot.headSha ?? 'head', draft: false, title: 'Ready', authorLogin: 'owner' }]; },
    async capturePullRequestSnapshot() { return snapshot; },
    async listPullRequestFiles() { return []; },
    async publishReview() { throw new Error('must not publish incomplete results'); },
    async updatePullRequestBody() {},
    async getCiStatus() { return { ready: false, pending: true, failed: false, count: 1, details: ['ci:pending'] }; },
    async mergePullRequest() { throw new Error('must not merge in fixture'); },
  };
  const store = new ReviewStore(cfg);
  const reviewer = new AutomaticReviewer(cfg, store, client, async () => ({ reviewId: 'review-incomplete' as ReviewId, snapshot, profile: cfg.profile, outcome: 'incomplete', candidates: [], verifications: [], findings: [], secretFindings: [], coverage: { selectedPaths: [], omittedPaths: [], complete: false }, attempts: 0, estimatedCostUsd: 0, error: 'fixture' }));
  const first = await reviewer.pollOnce();
  const second = await reviewer.pollOnce();
  assert.equal(first.failed, 0);
  assert.equal(second.skippedProcessed, 1);
  store.close();
});

test('PR summaries replace only the BlackBox marker block', () => {
  const root = tempRepo();
  const cfg = config(root);
  const snapshot = captureSnapshot(cfg, 'ref', 'HEAD');
  const result = { reviewId: id('review', 'summary') as ReviewId, snapshot: { ...snapshot, headSha: 'head' }, profile: 'static_only' as const, outcome: 'completed_clean' as const, candidates: [], verifications: [], findings: [], secretFindings: [], coverage: { selectedPaths: ['index.ts'], omittedPaths: [], complete: true }, attempts: 0, estimatedCostUsd: 0 };
  const original = `Keep this human text.\n${SUMMARY_START}\nold\n${SUMMARY_END}\nAfter text.`;
  const updated = mergeSummaryBody(original, result);
  assert.match(updated, /Keep this human text/);
  assert.match(updated, /After text/);
  assert.match(updated, /No supported issues found/);
  assert.match(updated, /Mergeability: 100\/100 — Ready for merge review/);
  assert.match(updated, /Coverage: Complete/);
  assert.match(updated, /Written by: BB AI/);
  assert.doesNotMatch(updated, /Estimated cost|Revision:|Changed files:|Reviewed by:/);
  assert.equal((updated.match(new RegExp(SUMMARY_START, 'g')) ?? []).length, 1);
  assert.equal(summaryCoversHead(updated, 'head'), true);
  assert.throws(() => mergeSummaryBody(`${SUMMARY_START}\nonly`, result), /marker pair/);
});

test('mergeability is deterministic and blocks incomplete reviews', () => {
  const root = tempRepo();
  const cfg = config(root);
  const snapshot = captureSnapshot(cfg, 'ref', 'HEAD');
  const clean = { reviewId: id('review', 'mergeability-clean') as ReviewId, snapshot: { ...snapshot, headSha: 'head' }, profile: 'static_only' as const, outcome: 'completed_clean' as const, candidates: [], verifications: [], findings: [], secretFindings: [], coverage: { selectedPaths: ['index.ts'], omittedPaths: [], complete: true }, attempts: 0, estimatedCostUsd: 0 };
  assert.deepEqual(assessMergeability(clean), { score: 100, label: 'Ready for merge review', reasons: ['No supported issues were found.'] });
  const finding = { ...clean, outcome: 'completed_findings' as const, findings: [{ findingId: id('finding', 'one') as FindingId, occurrenceId: 'occurrence-1', evidenceVersion: 'evidence-1', candidate: makeCandidate(), verification: { candidateId: 'candidate-1', decision: 'supported' as const, evidenceChecked: ['index.ts'], causalLink: 'introduced' as const, verificationKind: 'model_assessment' as const, reason: 'supported by changed code', uncertainty: 'none' } }] };
  assert.deepEqual(assessMergeability(finding), { score: 75, label: 'Needs changes', reasons: ['1 inline issue need attention.'] });
  const incomplete = { ...clean, outcome: 'incomplete' as const, coverage: { selectedPaths: [], omittedPaths: ['index.ts'], complete: false } };
  assert.deepEqual(assessMergeability(incomplete), { score: 0, label: 'Blocked', reasons: ['The review did not finish.'] });
  const partialClean = { ...clean, coverage: { selectedPaths: ['index.ts'], omittedPaths: ['other.ts', 'third.ts'], complete: false } };
  assert.deepEqual(assessMergeability(partialClean), { score: 75, label: 'Limited coverage', reasons: ['2 changed files were outside the review context.', 'No supported issues were found.'] });
});

test('static-only automatic reviews never satisfy the cloud merge gate', async () => {
  const root = tempRepo();
  const cfg = config(root, { profile: 'static_only', githubRepositories: [{ owner: 'owner', repo: 'repo' }], autoMerge: true });
  const snapshot = captureSnapshot(cfg, 'ref', 'HEAD');
  let mergeCalls = 0;
  const client = {
    async getPullRequest() { return { headSha: snapshot.headSha ?? 'head', body: null, draft: false, state: 'open' as const, mergeableState: 'clean' }; },
    async listOpenPullRequests() { return [{ ref: { owner: 'owner', repo: 'repo', number: 1 }, headSha: snapshot.headSha ?? 'head', draft: false, title: 'Ready', authorLogin: 'owner' }]; },
    async capturePullRequestSnapshot() { return snapshot; },
    async listPullRequestFiles() { return []; },
    async publishReview() { return { reviewId: 100 }; },
    async updatePullRequestBody() {},
    async getCiStatus() { return { ready: true, pending: false, failed: false, count: 2, details: ['build:success', 'test:success'] }; },
    async mergePullRequest(_ref: unknown, headSha: string) { assert.equal(headSha, snapshot.headSha); mergeCalls += 1; return { sha: 'merge-sha' }; },
  };
  const store = new ReviewStore(cfg);
  const cycle = await new AutomaticReviewer(cfg, store, client).pollOnce();
  assert.equal(cycle.merged, 0);
  assert.equal(cycle.waitingForCi, 1);
  assert.equal(mergeCalls, 0);
  assert.equal(store.getAutomaticHead('owner', 'repo', 1, snapshot.headSha ?? 'head')?.status, 'completed');
  store.close();
});

test('automatic merge refuses incomplete coverage even when the model reported clean', async () => {
  const root = tempRepo();
  const cfg = config(root, { githubRepositories: [{ owner: 'owner', repo: 'repo' }], autoMerge: true });
  const snapshot = captureSnapshot(cfg, 'ref', 'HEAD');
  const client = {
    async listOpenPullRequests() { return [{ ref: { owner: 'owner', repo: 'repo', number: 1 }, headSha: snapshot.headSha ?? 'head', draft: false, title: 'Ready', authorLogin: 'owner' }]; },
    async getPullRequest() { return { headSha: snapshot.headSha ?? 'head', body: null, draft: false, state: 'open' as const, mergeableState: 'clean' }; },
    async capturePullRequestSnapshot() { return snapshot; },
    async listPullRequestFiles() { return []; },
    async publishReview() { return { reviewId: 100 }; },
    async updatePullRequestBody() {},
    async getCiStatus() { return { ready: true, pending: false, failed: false, count: 2, details: ['build:success', 'test:success'] }; },
    async mergePullRequest() { throw new Error('must not merge'); },
  };
  const store = new ReviewStore(cfg);
  const result = { reviewId: id('review', 'partial') as ReviewId, snapshot, profile: 'static_only' as const, outcome: 'completed_clean' as const, candidates: [], verifications: [], findings: [], secretFindings: [], coverage: { selectedPaths: [], omittedPaths: ['omitted.ts'], complete: false }, attempts: 0, estimatedCostUsd: 0 };
  const cycle = await new AutomaticReviewer(cfg, store, client, async () => { store.saveResult(result); store.queuePublication(result.reviewId, snapshot.headSha, {}); return result; }).pollOnce();
  assert.equal(cycle.merged, 0);
  assert.equal(cycle.waitingForCi, 1);
  store.close();
});

function makeCandidate(sourceSha = 'source'): Candidate {
  return { candidateId: 'candidate-1', category: 'correctness', severity: 'high', title: 'returns the wrong value', trigger: 'the changed return path is selected', expected: 'the caller receives the stored value', actual: 'the caller receives a constant', impact: 'caller behavior is incorrect', changeRelevance: 'introduced', causalChangeRef: [{ path: 'index.ts', sha256: sourceSha, start: 1, end: 1, side: 'RIGHT', reason: 'changed return' }], evidence: [{ path: 'index.ts', sha256: sourceSha, start: 1, end: 1, side: 'RIGHT', reason: 'changed return' }], verificationKind: 'model_assessment', status: 'candidate' };
}

test('cloud pipeline uses two specialists and one verifier, then publishes only supported causal findings', async () => {
  const root = tempRepo();
  const cfg = config(root, { profile: 'economy_cloud_luna_v1', cloudBudgetUsd: 0.10 });
  const snap = captureSnapshot(cfg, 'ref', 'HEAD');
  const built = buildContext(snap, cfg.maxPacketBytes);
  const sourceSha = snap.files.find((file) => file.path === 'index.ts')?.sha256 ?? '';
  const responses: ProviderResponse[] = [
    { candidates: [makeCandidate(sourceSha)], inputTokens: 100, outputTokens: 100, rawStatus: 'ok' },
    { candidates: [makeCandidate(sourceSha)], inputTokens: 100, outputTokens: 100, rawStatus: 'ok' },
    { verifications: [{ candidateId: 'candidate-1', decision: 'supported', evidenceChecked: ['index.ts'], causalLink: 'introduced', verificationKind: 'model_assessment', reason: 'causal evidence matches changed code', uncertainty: 'no runtime reproduction' }], inputTokens: 100, outputTokens: 100, rawStatus: 'ok' },
  ];
  const provider = new FakeProvider(responses);
  const store = new ReviewStore(cfg);
  const result = await runReview(cfg, snap, built.packet, store, { authorizeCloud: true, provider });
  assert.equal(result.outcome, 'completed_findings');
  assert.equal(result.attempts, 3);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.candidate.evidence[0]?.sha256, sourceSha);
  assert.equal(provider.requests.length, 3);
  assert.equal(provider.requests[2]?.role, 'verifier');
  assert.equal(result.findings[0]?.verification.verificationKind, 'model_assessment');
  assert.ok(result.estimatedCostUsd > 0);
  store.close();
});

test('cloud pipeline bounds a provider evidence range to the selected file', async () => {
  const root = tempRepo();
  const cfg = config(root, { profile: 'economy_cloud_luna_v1', cloudBudgetUsd: 0.10 });
  const snap = captureSnapshot(cfg, 'ref', 'HEAD');
  const built = buildContext(snap, cfg.maxPacketBytes);
  const sourceSha = snap.files.find((file) => file.path === 'index.ts')?.sha256 ?? '';
  const candidate = { ...makeCandidate(sourceSha), evidence: [{ ...makeCandidate(sourceSha).evidence[0], end: 999 }], causalChangeRef: [{ ...makeCandidate(sourceSha).causalChangeRef[0], end: 999 }] };
  const provider = new FakeProvider([
    { candidates: [candidate], inputTokens: 10, outputTokens: 10, rawStatus: 'ok' },
    { candidates: [], inputTokens: 10, outputTokens: 10, rawStatus: 'ok' },
    { verifications: [{ candidateId: 'candidate-1', decision: 'supported', evidenceChecked: ['index.ts'], causalLink: 'introduced', verificationKind: 'model_assessment', reason: 'bounded evidence', uncertainty: '' }], inputTokens: 10, outputTokens: 10, rawStatus: 'ok' },
  ]);
  const store = new ReviewStore(cfg);
  const result = await runReview(cfg, snap, built.packet, store, { authorizeCloud: true, provider });
  assert.equal(result.outcome, 'completed_findings');
  assert.equal(result.findings[0]?.candidate.evidence[0]?.end, 2);
  store.close();
});

test('verifier output cannot claim runtime proof or omit a candidate', async () => {
  const root = tempRepo();
  const cfg = config(root, { profile: 'economy_cloud_luna_v1', cloudBudgetUsd: 0.10 });
  const snap = captureSnapshot(cfg, 'ref', 'HEAD');
  const built = buildContext(snap, cfg.maxPacketBytes);
  const sourceSha = snap.files.find((file) => file.path === 'index.ts')?.sha256 ?? '';
  const invalid: ProviderResponse[] = [
    { candidates: [makeCandidate(sourceSha)], inputTokens: 1, outputTokens: 1, rawStatus: 'ok' },
    { candidates: [], inputTokens: 1, outputTokens: 1, rawStatus: 'ok' },
    { verifications: [], inputTokens: 1, outputTokens: 1, rawStatus: 'ok' },
  ];
  const store = new ReviewStore(cfg);
  const result = await runReview(cfg, snap, built.packet, store, { authorizeCloud: true, provider: new FakeProvider(invalid) });
  assert.equal(result.outcome, 'incomplete');
  assert.match(result.error ?? '', /verifier omitted/);
  store.close();
});

test('Luna key selects TokenRouter and is never assigned to the direct OpenAI route', () => {
  const cfg = configFromEnv({ LUNA_API_KEY: 'present', SPAN_API_KEY: 'present' }, '/tmp');
  assert.equal(cfg.profile, 'economy_cloud_tokenrouter_luna_v1');
  assert.equal(cfg.cloudBudgetUsd, 0.10);
  assert.equal(cfg.tokenRouterApiKey, 'present');
  assert.equal(cfg.openAiApiKey, undefined);
  const direct = configFromEnv({ LUNA_API_KEY: 'router-key', REVIEWER_PROFILE: 'economy_cloud_luna_v1' }, '/tmp');
  assert.equal(createResponsesProvider(direct), undefined);
});

test('GitHub App publication credentials are all-or-nothing and do not use a personal token', () => {
  assert.throws(() => configFromEnv({ GITHUB_APP_ID: '123' }, '/tmp'), /configured together/);
  const configured = configFromEnv({ GITHUB_APP_ID: '123', GITHUB_APP_INSTALLATION_ID: '456', GITHUB_APP_PRIVATE_KEY_FILE: '/tmp/app.pem', GITHUB_TOKEN: 'personal' }, '/tmp');
  assert.deepEqual(githubAppCredentials(configured), { appId: '123', installationId: '456', privateKeyFile: '/tmp/app.pem' });
  assert.equal(configured.githubToken, 'personal');
  const inMemory = configFromEnv({ GITHUB_APP_ID: '123', GITHUB_APP_INSTALLATION_ID: '456', GITHUB_APP_PRIVATE_KEY: 'pem' }, '/tmp');
  assert.deepEqual(githubAppCredentials(inMemory), { appId: '123', installationId: '456', privateKeyPem: 'pem' });
});

test('GitHub App signs a short-lived JWT and exchanges it for an installation token', async () => {
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const directory = mkdtempSync(join(tmpdir(), 'blackbox-github-app-'));
  const privateKeyFile = join(directory, 'private-key.pem');
  writeFileSync(privateKeyFile, key.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  chmodSync(privateKeyFile, 0o600);
  const credentials = { appId: '123456', installationId: '987654', privateKeyFile };
  let request: { url: string; authorization: string | null } | undefined;
  const fetcher: typeof fetch = async (input, init) => {
    request = { url: String(input), authorization: new Headers(init?.headers).get('authorization') };
    return new Response(JSON.stringify({ token: 'installation-token', expires_at: '2099-01-01T00:00:00Z' }), { status: 201 });
  };
  const token = await createGitHubInstallationToken(credentials, fetcher, 1_700_000_000, 'https://github.test');
  assert.deepEqual(token, { token: 'installation-token', expiresAt: '2099-01-01T00:00:00Z' });
  assert.equal(request?.url, 'https://github.test/app/installations/987654/access_tokens');
  assert.match(request?.authorization ?? '', /^Bearer [^.]+\.[^.]+\.[^.]+$/);
  const [, encodedPayload] = (request?.authorization ?? '').slice('Bearer '.length).split('.');
  const payload = JSON.parse(Buffer.from(encodedPayload ?? '', 'base64url').toString('utf8')) as { iss: string; iat: number; exp: number };
  assert.deepEqual(payload, { iss: '123456', iat: 1_699_999_940, exp: 1_700_000_540 });
  const jwt = createGitHubAppJwt(credentials, key.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 1_700_000_000);
  assert.equal(jwt.split('.').length, 3);
});

test('GitHub App private keys must not be group or world accessible', async () => {
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const directory = mkdtempSync(join(tmpdir(), 'blackbox-github-app-mode-'));
  const privateKeyFile = join(directory, 'private-key.pem');
  writeFileSync(privateKeyFile, key.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  chmodSync(privateKeyFile, 0o644);
  await assert.rejects(createGitHubInstallationToken({ appId: '123', installationId: '456', privateKeyFile }, async () => new Response('{}')), /group\/world accessible/);
});

test('TokenRouter Luna uses the configured gateway and keeps local-only mode authoritative', async () => {
  const cfg = configFromEnv({ LUNA_API_KEY: 'router-key', TOKENROUTER_BASE_URL: 'https://router.test/v1/', TOKENROUTER_MODEL_ID: 'luna-fixture' }, '/tmp');
  const requests: { url: string; authorization: string | null; body: Record<string, unknown> }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), authorization: new Headers(init?.headers).get('authorization'), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ output_text: JSON.stringify({ candidates: [] }), usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
  };
  const provider = createResponsesProvider(cfg, fetcher);
  assert.ok(provider);
  const snap = captureSnapshot(config(tempRepo()), 'ref', 'HEAD');
  await provider.review({ role: 'correctness', snapshotId: snap.id, packet: buildContext(snap, cfg.maxPacketBytes).packet, requestId: 'router-attempt', maxOutputTokens: 4096 });
  assert.equal(requests[0]?.url, 'https://router.test/v1/responses');
  assert.equal(requests[0]?.authorization, 'Bearer router-key');
  assert.equal(requests[0]?.body.model, 'luna-fixture');
  assert.deepEqual(requests[0]?.body.reasoning, { effort: 'medium' });
  assert.equal(requests[0]?.body.max_output_tokens, 4096);
  assert.equal(TOKENROUTER_ROUTE.baseUrl, 'https://api.tokenrouter.com/v1');
  const local = configFromEnv({ LUNA_API_KEY: 'router-key', REVIEWER_LOCAL_ONLY: 'true', REVIEWER_PROFILE: 'economy_cloud_tokenrouter_luna_v1' }, '/tmp');
  assert.equal(local.profile, 'static_only');
  assert.equal(createResponsesProvider(local, fetcher), undefined);
  assert.throws(() => configFromEnv({ LUNA_API_KEY: 'router-key', TOKENROUTER_BASE_URL: 'http://router.test/v1' }, '/tmp'), /HTTPS/);
});

test('config discovers the enclosing worktree when invoked from the reviewer package', () => {
  const root = tempRepo();
  mkdirSync(join(root, 'reviewer'), { recursive: true });
  const cfg = configFromEnv({}, join(root, 'reviewer'));
  assert.equal(cfg.root, realpathSync(root));
});

test('local status server is loopback-only and bearer-token protected', async () => {
  const handle = await listenStatusServer(config(tempRepo()), 'status-token');
  try {
    const health = await fetch(`http://127.0.0.1:${handle.port}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });
    const denied = await fetch(`http://127.0.0.1:${handle.port}/status`);
    assert.equal(denied.status, 401);
    const allowed = await fetch(`http://127.0.0.1:${handle.port}/status`, { headers: { authorization: 'Bearer status-token' } });
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json() as { integrity: string }).integrity, 'ok');
  } finally {
    await handle.close();
  }
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

test('GitHub adapter lists open PR heads and draft state for automatic polling', async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    assert.match(url, /pulls\?state=open/);
    return new Response(JSON.stringify([{ number: 3, title: 'Ready', draft: false, user: { login: 'owner' }, head: { sha: 'head-3' } }, { number: 4, title: 'Draft', draft: true, user: { login: 'owner' }, head: { sha: 'head-4' } }]), { status: 200 });
  };
  const api = new GitHubApi('app-token', fetcher, 'https://github.test');
  assert.deepEqual(await api.listOpenPullRequests({ owner: 'owner', repo: 'repo' }), [
    { ref: { owner: 'owner', repo: 'repo', number: 3 }, headSha: 'head-3', draft: false, title: 'Ready', authorLogin: 'owner' },
    { ref: { owner: 'owner', repo: 'repo', number: 4 }, headSha: 'head-4', draft: true, title: 'Draft', authorLogin: 'owner' },
  ]);
});

test('GitHub adapter requires every completed check to conclude success', async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('/check-runs')) return new Response(JSON.stringify({ check_runs: [{ name: 'build', status: 'completed', conclusion: 'success' }, { name: 'lint', status: 'completed', conclusion: 'neutral' }] }), { status: 200 });
    if (url.includes('/status')) return new Response(JSON.stringify({ statuses: [] }), { status: 200 });
    throw new Error(`unexpected request ${url}`);
  };
  const api = new GitHubApi('app-token', fetcher, 'https://github.test');
  const status = await api.getCiStatus({ owner: 'owner', repo: 'repo', number: 1 }, 'head');
  assert.equal(status.ready, false);
  assert.equal(status.failed, true);
});

test('GitHub adapter requires configured CI check names for automatic merge', async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('/check-runs')) return new Response(JSON.stringify({ check_runs: [{ name: 'unrelated', status: 'completed', conclusion: 'success' }] }), { status: 200 });
    if (url.includes('/status')) return new Response(JSON.stringify({ statuses: [] }), { status: 200 });
    throw new Error(`unexpected request ${url}`);
  };
  const api = new GitHubApi('app-token', fetcher, 'https://github.test');
  const status = await api.getCiStatus({ owner: 'owner', repo: 'repo', number: 1 }, 'head', ['reviewer']);
  assert.equal(status.ready, false);
  assert.equal(status.pending, true);
});

test('GitHub publisher posts one COMMENT review with only changed-line anchors', async () => {
  const requests: { url: string; method: string; body?: string }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : undefined });
    if (url.endsWith('/pulls/7')) return new Response(JSON.stringify({ base: { sha: 'base' }, head: { sha: 'head' }, title: 'Fixture', body: null }), { status: 200 });
    if (url.includes('/pulls/7/reviews')) return new Response(JSON.stringify({ id: 42, html_url: 'https://github.test/review/42' }), { status: 200 });
    throw new Error(`unexpected request ${url}`);
  };
  const api = new GitHubApi('write-token', fetcher, 'https://github.test');
  const published = await api.publishReview({ owner: 'owner', repo: 'repo', number: 7 }, { commit_id: 'head', event: 'COMMENT', body: 'summary', comments: [{ path: 'index.ts', line: 3, side: 'RIGHT', body: 'fix' }] });
  assert.equal(published.reviewId, 42);
  assert.equal(requests.at(-1)?.method, 'POST');
  assert.match(requests.at(-1)?.body ?? '', /"event":"COMMENT"/);
});

test('GitHub PR summary updates verify the head and body after writing', async () => {
  const requests: { url: string; method: string; headers?: HeadersInit }[] = [];
  let body = 'old';
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? 'GET', headers: init?.headers });
    if (url.endsWith('/pulls/7') && init?.method === 'PATCH') { body = JSON.parse(String(init.body)).body as string; return new Response('{}', { status: 200 }); }
    if (url.endsWith('/pulls/7')) return new Response(JSON.stringify({ base: { sha: 'base' }, head: { sha: 'head' }, title: 'Fixture', body, draft: false, state: 'open' }), { status: 200 });
    throw new Error(`unexpected request ${url}`);
  };
  const api = new GitHubApi('write-token', fetcher, 'https://github.test');
  await api.updatePullRequestBody({ owner: 'owner', repo: 'repo', number: 7 }, 'new', 'head', sha256('old'));
  const patch = requests.find((request) => request.method === 'PATCH');
  assert.ok(patch);
  assert.equal(new Headers(patch.headers).get('if-match'), null);
  assert.equal(requests.filter((request) => request.method === 'GET').length, 2);
});

test('GitHub diff parser identifies added right-side lines', () => {
  const lines = changedRightLines([{ path: 'index.ts', status: 'modified', additions: 2, deletions: 1, patch: '@@ -1,2 +1,3 @@\n old\n-old\n+new\n+newer\n' }]);
  assert.deepEqual([...lines.get('index.ts') ?? []], [2, 3]);
});

test('publisher preview keeps exact reviewed head and changed-line anchors', () => {
  const root = tempRepo();
  const cfg = config(root);
  const snapshot = captureSnapshot(cfg, 'ref', 'HEAD');
  const findingCandidate = { ...makeCandidate(), evidence: [{ path: 'index.ts', sha256: 'source', start: 1, end: 1, side: 'RIGHT' as const, reason: 'changed line' }], causalChangeRef: [{ path: 'index.ts', sha256: 'source', start: 1, end: 1, side: 'RIGHT' as const, reason: 'changed line' }] };
  const verification = { candidateId: findingCandidate.candidateId, decision: 'supported' as const, evidenceChecked: ['index.ts'], causalLink: 'introduced' as const, verificationKind: 'model_assessment' as const, reason: 'supported', uncertainty: '' };
  const result = { reviewId: id('review', 'publisher') as ReviewId, snapshot: { ...snapshot, changedPaths: ['index.ts'], headSha: 'head-sha' }, profile: 'static_only' as const, outcome: 'completed_findings' as const, candidates: [findingCandidate], verifications: [verification], findings: [{ findingId: id('finding', 'publisher') as never, occurrenceId: 'occurrence', evidenceVersion: 'version', candidate: findingCandidate, verification }], secretFindings: [], coverage: { selectedPaths: ['index.ts'], omittedPaths: [], complete: true }, attempts: 3, estimatedCostUsd: 0.01 };
  const preview = buildReviewPreview(result);
  assert.equal(preview.commit_id, 'head-sha');
  assert.equal(preview.event, 'COMMENT');
  assert.match(preview.body, /Mergeability: 75\/100 — Needs changes/);
  assert.match(preview.body, /Written by: BB AI/);
  assert.doesNotMatch(preview.body, /Estimated cost|Revision:|Changed files:|Reviewed by:/);
  assert.equal(preview.comments[0]?.path, 'index.ts');
  assert.equal(preview.comments[0]?.line, 1);
  assert.equal(buildReviewPreview(result, undefined, 0).comments.length, 0);
});

test('publisher escapes model-controlled review text before posting Markdown', () => {
  const root = tempRepo();
  const cfg = config(root);
  const snapshot = captureSnapshot(cfg, 'ref', 'HEAD');
  const candidate = { ...makeCandidate(), title: '[click](https://evil.example) @everyone', impact: '`spoof` **impact**', actual: '<script>alert(1)</script>', expected: 'safe value' };
  const verification = { candidateId: candidate.candidateId, decision: 'supported' as const, evidenceChecked: ['index.ts'], causalLink: 'introduced' as const, verificationKind: 'model_assessment' as const, reason: 'see https://evil.example @maintainer', uncertainty: '' };
  const result = { reviewId: id('review', 'escaping') as ReviewId, snapshot: { ...snapshot, changedPaths: ['index.ts'], headSha: 'head-sha' }, profile: 'static_only' as const, outcome: 'completed_findings' as const, candidates: [candidate], verifications: [verification], findings: [{ findingId: id('finding', 'escaping') as never, occurrenceId: 'occurrence', evidenceVersion: 'version', candidate, verification }], secretFindings: [], coverage: { selectedPaths: ['index.ts'], omittedPaths: [], complete: true }, attempts: 3, estimatedCostUsd: 0 };
  const comment = buildReviewPreview(result).comments[0]?.body ?? '';
  assert.match(comment, /\\\[click\\\]/);
  assert.match(comment, /\\@everyone/);
  assert.doesNotMatch(comment, /\(https:\/\/evil\.example\)/);
  assert.doesNotMatch(comment, /<script>/);
});

test('Responses adapter sends the configured medium reasoning route without tools or hidden retries', async () => {
  const root = tempRepo();
  const cfg = config(root);
  const snapshot = captureSnapshot(cfg, 'ref', 'HEAD');
  const packet = buildContext(snapshot, cfg.maxPacketBytes).packet;
  let body: Record<string, unknown> | undefined;
  const fetcher: typeof fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ output_text: JSON.stringify({ candidates: [] }), usage: { input_tokens: 12, output_tokens: 4 } }), { status: 200 });
  };
  const provider = new ResponsesProvider(OPENAI_ROUTE, 'test-key', fetcher);
  const response = await provider.review({ role: 'correctness', snapshotId: snapshot.id, packet, requestId: 'attempt-1' });
  assert.equal(response.candidates?.length, 0);
  assert.deepEqual(body?.reasoning, { effort: 'medium' });
  assert.equal(body?.model, 'gpt-6-luna');
  assert.equal((body?.tools as unknown[] | undefined)?.length ?? 0, 0);
  assert.match(String(body?.input ?? ''), /SHA256/);
});
