import { buildContext } from './context.js';
import { changedRightLines, type PullRequestFile, type PullRequestRef, type PullRequestSummary, type ReviewPreview } from './github.js';
import { createResponsesProvider } from './provider.js';
import { runReview } from './pipeline.js';
import { buildReviewPreview } from './publisher.js';
import { ReviewStore } from './store.js';
import type { ProviderAdapter, ReviewConfig, ReviewResult, Snapshot } from './types.js';

export interface AutomaticClient {
  getPullRequest(ref: PullRequestRef): Promise<{ readonly headSha: string; readonly body: string | null; readonly draft: boolean; readonly state: 'open' | 'closed'; readonly mergeableState?: string }>;
  listOpenPullRequests(repository: { readonly owner: string; readonly repo: string }): Promise<readonly PullRequestSummary[]>;
  capturePullRequestSnapshot(ref: PullRequestRef): Promise<Snapshot>;
  listPullRequestFiles(ref: PullRequestRef): Promise<readonly PullRequestFile[]>;
  publishReview(ref: PullRequestRef, payload: ReviewPreview): Promise<{ readonly reviewId: number; readonly url?: string }>;
  getCiStatus(ref: PullRequestRef, headSha: string, requiredChecks?: readonly string[]): Promise<{ readonly ready: boolean; readonly pending: boolean; readonly failed: boolean; readonly count: number; readonly details: readonly string[] }>;
  mergePullRequest(ref: PullRequestRef, headSha: string): Promise<{ readonly sha?: string; readonly url?: string }>;
}

export interface AutomaticCycle {
  readonly discovered: number;
  readonly skippedDrafts: number;
  readonly skippedProcessed: number;
  readonly reviewed: number;
  readonly published: number;
  readonly summaries: number;
  readonly merged: number;
  readonly waitingForCi: number;
  readonly failed: number;
}

export type AutomaticRunner = (snapshot: Snapshot, store: ReviewStore) => Promise<ReviewResult>;

export class AutomaticReviewer {
  readonly #config: ReviewConfig;
  readonly #store: ReviewStore;
  readonly #client: AutomaticClient;
  readonly #run: AutomaticRunner;

  constructor(config: ReviewConfig, store: ReviewStore, client: AutomaticClient, runner?: AutomaticRunner) {
    this.#config = config;
    this.#store = store;
    this.#client = client;
    this.#run = runner ?? ((snapshot, reviewStore) => runAutomaticReview(this.#config, snapshot, reviewStore));
  }

  async pollOnce(): Promise<AutomaticCycle> {
    const repositories = this.#config.githubRepositories ?? [];
    let discovered = 0; let skippedDrafts = 0; let skippedProcessed = 0; let reviewed = 0; let published = 0; let summaries = 0; let merged = 0; let waitingForCi = 0; let failed = 0;
    const limit = this.#config.maxAutomaticReviewsPerPoll ?? 1;
    for (const repository of repositories) {
      if (reviewed >= limit) break;
      const pullRequests = await this.#client.listOpenPullRequests(repository);
      discovered += pullRequests.length;
      for (const pullRequest of pullRequests) {
        if (reviewed >= limit) break;
        if (this.#config.automaticPullRequestNumber !== undefined && pullRequest.ref.number !== this.#config.automaticPullRequestNumber) continue;
        if (pullRequest.draft && !(this.#config.includeDrafts ?? false)) { skippedDrafts += 1; continue; }
        if (!pullRequest.authorLogin || pullRequest.authorLogin.toLowerCase() !== repository.owner.toLowerCase()) continue;
        const leaseGeneration = this.#store.claimAutomaticLease(pullRequest.ref.owner, pullRequest.ref.repo, pullRequest.ref.number, pullRequest.headSha, 15 * 60_000);
        if (leaseGeneration === undefined) {
          skippedProcessed += 1;
          if (this.#config.autoMerge) {
            try {
              if (await this.tryMerge(pullRequest)) merged += 1; else waitingForCi += 1;
            } catch (error) {
              failed += 1;
              console.error(JSON.stringify({ event: 'automatic_merge_check_failed', repository: `${pullRequest.ref.owner}/${pullRequest.ref.repo}`, pullRequest: pullRequest.ref.number, headSha: pullRequest.headSha, error: error instanceof Error ? error.message : 'unknown error' }));
            }
          }
          continue;
        }
        reviewed += 1;
        try {
          const assertLease = (): void => {
            if (!this.#store.automaticLeaseCurrent(pullRequest.ref.owner, pullRequest.ref.repo, pullRequest.ref.number, pullRequest.headSha, leaseGeneration)) {
              throw new Error('automatic review lease expired or was reclaimed');
            }
          };
          const snapshot = await this.#client.capturePullRequestSnapshot(pullRequest.ref);
          if (snapshot.headSha !== pullRequest.headSha) throw new Error(`PR head changed while snapshotting: listed ${pullRequest.headSha}, captured ${snapshot.headSha}`);
          const result = await this.#run(snapshot, this.#store);
          if ((result.outcome === 'completed_clean' || result.outcome === 'completed_findings') && result.secretFindings.length === 0) {
            const files = await this.#client.listPullRequestFiles(pullRequest.ref);
            const payload = buildReviewPreview(result, changedRightLines(files), this.#config.maxInlineFindings);
            assertLease();
            await this.#client.publishReview(pullRequest.ref, payload);
            this.#store.markPublication(result.reviewId, 'published');
            published += 1;
            // The review body already contains the summary. GitHub has no atomic
            // compare-and-swap for PR description updates, so do not mutate it.
            const summaryReady = true;
            assertLease();
            this.#store.completeAutomaticHead(pullRequest.ref.owner, pullRequest.ref.repo, pullRequest.ref.number, pullRequest.headSha, 'completed', result.reviewId, 900_000, Date.now(), leaseGeneration);
            if (this.#config.autoMerge && summaryReady && result.outcome === 'completed_clean') {
              try {
                if (await this.tryMerge(pullRequest)) merged += 1; else waitingForCi += 1;
              } catch (error) {
                failed += 1;
                console.error(JSON.stringify({ event: 'automatic_merge_check_failed', repository: `${pullRequest.ref.owner}/${pullRequest.ref.repo}`, pullRequest: pullRequest.ref.number, headSha: pullRequest.headSha, error: error instanceof Error ? error.message : 'unknown error' }));
              }
            }
          } else {
            this.#store.markPublication(result.reviewId, 'not_published');
            this.#store.completeAutomaticHead(pullRequest.ref.owner, pullRequest.ref.repo, pullRequest.ref.number, pullRequest.headSha, 'failed', result.reviewId, 900_000, Date.now(), leaseGeneration);
          }
        } catch (error) {
          failed += 1;
          this.#store.completeAutomaticHead(pullRequest.ref.owner, pullRequest.ref.repo, pullRequest.ref.number, pullRequest.headSha, 'failed', undefined, 900_000, Date.now(), leaseGeneration);
          console.error(JSON.stringify({ event: 'automatic_review_failed', repository: `${pullRequest.ref.owner}/${pullRequest.ref.repo}`, pullRequest: pullRequest.ref.number, headSha: pullRequest.headSha, error: error instanceof Error ? error.message : 'unknown error' }));
        }
      }
    }
    return { discovered, skippedDrafts, skippedProcessed, reviewed, published, summaries, merged, waitingForCi, failed };
  }

  async tryMerge(pullRequest: PullRequestSummary): Promise<boolean> {
    const record = this.#store.getAutomaticHead(pullRequest.ref.owner, pullRequest.ref.repo, pullRequest.ref.number, pullRequest.headSha);
    if (!record || record.status !== 'completed' || !record.reviewId) return false;
    const result = this.#store.getReview(record.reviewId);
    if (!result || !mergeEligible(result)) return false;
    const pr = await this.#client.getPullRequest(pullRequest.ref);
    if (pr.state !== 'open' || pr.draft || pr.headSha !== pullRequest.headSha) return false;
    const ci = await this.#client.getCiStatus(pullRequest.ref, pullRequest.headSha, this.#config.requiredCiChecks);
    if (!ci.ready) return false;
    await this.#client.mergePullRequest(pullRequest.ref, pullRequest.headSha);
    this.#store.markAutomaticMerged(pullRequest.ref.owner, pullRequest.ref.repo, pullRequest.ref.number, pullRequest.headSha);
    return true;
  }
}

function mergeEligible(result: ReviewResult): boolean {
  return result.outcome === 'completed_clean'
    && result.coverage.complete
    && result.deterministicSecurityCheck?.secretScanCompleted === true
    && result.deterministicSecurityCheck.findings === 0
    && result.attempts >= 3
    && result.verifications.every((verification) => verification.decision === 'supported' || verification.decision === 'rejected');
}

export async function runAutomaticReview(config: ReviewConfig, snapshot: Snapshot, store: ReviewStore): Promise<ReviewResult> {
  const { packet } = buildContext(snapshot, config.maxPacketBytes);
  const provider = configuredProvider(config);
  return runReview(config, snapshot, packet, store, { provider, authorizeCloud: config.profile !== 'static_only' });
}

function configuredProvider(config: ReviewConfig): ProviderAdapter | undefined {
  return config.profile === 'static_only' ? undefined : createResponsesProvider(config);
}

export type { PullRequestFile, PullRequestRef, PullRequestSummary, ReviewPreview };
