import { id, sha256 } from './hash.js';
import type { Candidate, ContextPacket, FindingOccurrence, ProviderAdapter, ProviderRequest, ProviderResponse, ReviewConfig, ReviewId, ReviewResult, Snapshot, Verification } from './types.js';
import { ReviewStore } from './store.js';

export interface RunOptions {
  readonly reviewId?: ReviewId;
  readonly provider?: ProviderAdapter;
  readonly authorizeCloud?: boolean;
}

export async function runReview(config: ReviewConfig, snapshot: Snapshot, packet: ContextPacket, store: ReviewStore, options: RunOptions = {}): Promise<ReviewResult> {
  const reviewId = (options.reviewId ?? id('review', `${snapshot.id}:${config.profile}`)) as ReviewId;
  const base = { reviewId, snapshot, profile: config.profile, candidates: [], verifications: [], findings: [], secretFindings: packet.secretFindings, coverage: { selectedPaths: packet.files.map((file) => file.path), omittedPaths: packet.omittedPaths, complete: packet.omittedPaths.length === 0 }, attempts: 0, estimatedCostUsd: 0 };
  if (config.profile === 'static_only') {
    const result = { ...base, outcome: packet.secretFindings.length > 0 ? 'completed_findings' as const : 'completed_clean' as const };
    store.saveResult(result);
    store.queuePublication(reviewId, snapshot.headSha, { kind: 'preview', result });
    return result;
  }
  if (options.authorizeCloud === false || !options.provider) {
    const result = { ...base, outcome: 'unauthorized' as const, error: 'cloud review requires explicit run authorization and a selected provider route' };
    store.saveResult(result);
    return result;
  }
  if (packet.secretFindings.length > 0) {
    const result = { ...base, outcome: 'incomplete' as const, error: 'secret findings block outbound model dispatch and external publication' };
    store.saveResult(result);
    return result;
  }
  const provider = options.provider;
  const maxCostCents = Math.ceil(config.maxInputTokens / 1_000_000 * provider.route.inputPricePerMillion * 100 + config.maxOutputTokens / 1_000_000 * provider.route.outputPricePerMillion * 100) * config.maxAttempts;
  if (maxCostCents > Math.floor(config.cloudBudgetUsd * 100)) {
    const result = { ...base, outcome: 'awaiting_budget' as const, error: `maximum reserved liability of ${maxCostCents} cents exceeds the configured cloud budget` };
    store.saveResult(result);
    return result;
  }
  store.reserve(reviewId, config.maxAttempts, maxCostCents);
  let attempts = 0;
  let estimatedCostUsd = 0;
  let candidates: Candidate[] = [];
  let verifications: Verification[] = [];
  try {
    for (const role of ['correctness', 'security'] as const) {
      const response = await attempt(provider, store, reviewId, role, { role, snapshotId: snapshot.id, packet, requestId: `${reviewId}:${role}:0`, maxOutputTokens: config.maxOutputTokens }, maxCostCents / config.maxAttempts);
      attempts += 1;
      estimatedCostUsd += cost(response.inputTokens, response.outputTokens, provider);
      candidates.push(...(response.candidates ?? []));
    }
    candidates = dedupe(candidates);
    if (candidates.length > 0) {
      const response = await attempt(provider, store, reviewId, 'verifier', { role: 'verifier', snapshotId: snapshot.id, packet, candidates, requestId: `${reviewId}:verifier:0`, maxOutputTokens: config.maxOutputTokens }, maxCostCents / config.maxAttempts);
      attempts += 1;
      estimatedCostUsd += cost(response.inputTokens, response.outputTokens, provider);
      verifications = validateVerificationSet(candidates, response.verifications ?? []);
    }
    const findings = makeFindings(candidates, verifications, snapshot);
    const result: ReviewResult = { ...base, outcome: findings.length > 0 ? 'completed_findings' : 'completed_clean', candidates, verifications, findings, attempts, estimatedCostUsd };
    store.saveResult(result);
    store.queuePublication(reviewId, snapshot.headSha, { kind: 'preview', result });
    return result;
  } catch (error) {
    const result: ReviewResult = { ...base, outcome: 'incomplete', candidates, verifications, attempts, estimatedCostUsd, error: error instanceof Error ? error.message : 'review failed' };
    store.saveResult(result);
    return result;
  }
}

async function attempt(provider: ProviderAdapter, store: ReviewStore, reviewId: ReviewId, role: ProviderRequest['role'], request: ProviderRequest, maxAttemptCostCents: number): Promise<ProviderResponse> {
  try {
    const response = await provider.review(request);
    store.recordAttempt(reviewId, role, request.requestId, response.rawStatus, response.inputTokens, response.outputTokens, Math.ceil(costFor(response.inputTokens, response.outputTokens, provider) * 100));
    return response;
  } catch (error) {
    store.recordAttempt(reviewId, role, request.requestId, 'unknown', 0, 0, Math.ceil(maxAttemptCostCents));
    throw error;
  }
}

function costFor(inputTokens: number, outputTokens: number, provider: ProviderAdapter): number {
  return inputTokens / 1_000_000 * provider.route.inputPricePerMillion + outputTokens / 1_000_000 * provider.route.outputPricePerMillion;
}

function dedupe(candidates: readonly Candidate[]): Candidate[] {
  const seen = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = `${candidate.category}:${candidate.changeRelevance}:${candidate.title.toLowerCase()}:${candidate.causalChangeRef.map((ref) => `${ref.path}:${ref.start}`).join(',')}`;
    if (!seen.has(key)) seen.set(key, candidate);
  }
  return [...seen.values()].slice(0, 12);
}

function validateVerificationSet(candidates: readonly Candidate[], verifications: readonly Verification[]): Verification[] {
  const expected = new Set(candidates.map((candidate) => candidate.candidateId));
  const seen = new Set<string>();
  for (const verification of verifications) {
    if (!expected.has(verification.candidateId) || seen.has(verification.candidateId)) throw new Error('verifier returned missing, duplicate, or invented candidate IDs');
    seen.add(verification.candidateId);
  }
  if (seen.size !== expected.size) throw new Error('verifier omitted a candidate');
  return [...verifications];
}

function makeFindings(candidates: readonly Candidate[], verifications: readonly Verification[], snapshot: Snapshot): FindingOccurrence[] {
  const byId = new Map(verifications.map((verification) => [verification.candidateId, verification]));
  return candidates.flatMap((candidate) => {
    const verification = byId.get(candidate.candidateId);
    if (!verification || verification.decision !== 'supported' || verification.causalLink === 'pre_existing' || verification.causalLink === 'uncertain') return [];
    if (verification.verificationKind !== 'model_assessment' && verification.verificationKind !== 'deterministic_analysis') return [];
    const findingId = id('finding', `${candidate.category}:${candidate.title}:${candidate.causalChangeRef.map((ref) => `${ref.path}:${ref.start}:${ref.end}`).join('|')}`) as FindingOccurrence['findingId'];
    const occurrenceId = id('occurrence', `${findingId}:${snapshot.id}`);
    return [{ findingId, occurrenceId, evidenceVersion: sha256(JSON.stringify({ snapshot: snapshot.id, evidence: candidate.evidence })), candidate, verification }];
  });
}

function cost(inputTokens: number, outputTokens: number, provider: ProviderAdapter): number {
  return inputTokens / 1_000_000 * provider.route.inputPricePerMillion + outputTokens / 1_000_000 * provider.route.outputPricePerMillion;
}
