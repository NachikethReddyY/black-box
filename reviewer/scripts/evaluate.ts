import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContext } from '../src/context.js';
import { FakeProvider } from '../src/provider.js';
import { runReview } from '../src/pipeline.js';
import { reportJson, reportMarkdown } from '../src/report.js';
import { captureSnapshot } from '../src/snapshot.js';
import { ReviewStore } from '../src/store.js';
import type { Candidate, ProviderResponse, ReviewConfig } from '../src/types.js';
import { tempRepo, run } from '../test/helpers.js';

const outputDir = join(process.cwd(), 'evidence');
mkdirSync(outputDir, { recursive: true });
const clean = await runCase('clean', []);
const bug = await runCase('bug', [makeCandidate()]);
const report = { generatedAt: new Date().toISOString(), cases: [clean.summary, bug.summary], limitations: ['Provider responses are controlled fixtures. This proves orchestration and accounting, not live model precision or recall.', 'No GitHub publication or cloud request was performed.'] };
writeFileSync(join(outputDir, 'smoke-evaluation.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
writeFileSync(join(outputDir, 'demo-review.json'), reportJson(bug.result), { mode: 0o600 });
writeFileSync(join(outputDir, 'demo-review.md'), reportMarkdown(bug.result), { mode: 0o600 });
console.log(JSON.stringify({ outputDir, report }, null, 2));

async function runCase(name: string, responses: readonly Candidate[]) {
  const root = tempRepo();
  const config: ReviewConfig = { root, dataDir: mkdtempSync(join(tmpdir(), 'blackbox-reviewer-eval-data-')), profile: 'economy_cloud_luna_v1', maxAttempts: 4, maxInputTokens: 32_768, maxOutputTokens: 16_384, maxPacketBytes: 128 * 1024, maxInlineFindings: 5, cloudBudgetUsd: 0.10 };
  const snapshot = captureSnapshot(config, 'ref', 'HEAD');
  const packet = buildContext(snapshot, config.maxPacketBytes).packet;
  const providerResponses: ProviderResponse[] = [{ candidates: responses, inputTokens: 100, outputTokens: 100, rawStatus: 'ok' }, { candidates: [], inputTokens: 100, outputTokens: 100, rawStatus: 'ok' }];
  if (responses.length > 0) providerResponses.push({ verifications: responses.map((candidate) => ({ candidateId: candidate.candidateId, decision: 'supported' as const, evidenceChecked: candidate.evidence.map((ref) => ref.path), causalLink: candidate.changeRelevance, verificationKind: 'model_assessment' as const, reason: 'fixture supports the seeded candidate', uncertainty: 'fixture only' })), inputTokens: 100, outputTokens: 100, rawStatus: 'ok' });
  const provider = new FakeProvider(providerResponses);
  const store = new ReviewStore(config);
  const result = await runReview(config, snapshot, packet, store, { authorizeCloud: true, provider });
  store.close();
  return { result, summary: { name, outcome: result.outcome, attempts: result.attempts, findings: result.findings.length, estimatedCostUsd: result.estimatedCostUsd } };
}

function makeCandidate(): Candidate {
  return { candidateId: 'seeded-bug', category: 'correctness', severity: 'high', title: 'seeded behavior regression', trigger: 'the fixture changes the return behavior', expected: 'the existing caller contract remains true', actual: 'the changed code violates the contract', impact: 'the caller receives incorrect behavior', changeRelevance: 'introduced', causalChangeRef: [{ path: 'index.ts', sha256: 'fixture', start: 1, end: 1, side: 'RIGHT', reason: 'seeded change' }], evidence: [{ path: 'index.ts', sha256: 'fixture', start: 1, end: 1, side: 'RIGHT', reason: 'seeded change' }], verificationKind: 'model_assessment', status: 'candidate' };
}
