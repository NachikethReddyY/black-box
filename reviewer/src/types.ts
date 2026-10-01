export type SnapshotMode = 'working_tree' | 'staged' | 'ref';
export type ReviewProfile = 'static_only' | 'economy_cloud_luna_v1' | 'economy_cloud_tokenrouter_luna_v1';
export type ReviewOutcome = 'completed_clean' | 'completed_findings' | 'incomplete' | 'errored' | 'awaiting_budget' | 'unauthorized';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type CandidateCategory = 'correctness' | 'security' | 'performance' | 'reliability' | 'tests' | 'policy';
export type VerificationDecision = 'supported' | 'rejected' | 'needs_more_context' | 'requires_runtime_validation';

export type SnapshotId = string & { readonly __snapshotId: unique symbol };
export type ReviewId = string & { readonly __reviewId: unique symbol };
export type FindingId = string & { readonly __findingId: unique symbol };

export interface SourceFile {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly content: string;
  readonly binary: boolean;
}

export interface EvidenceRef {
  readonly path: string;
  readonly sha256: string;
  readonly start: number;
  readonly end: number;
  readonly side: 'LEFT' | 'RIGHT';
  readonly reason: string;
}

export interface Snapshot {
  readonly id: SnapshotId;
  readonly mode: SnapshotMode;
  readonly root: string;
  readonly baseRef: string;
  readonly headRef: string;
  readonly headSha: string | null;
  readonly files: readonly SourceFile[];
  readonly changedPaths: readonly string[];
  readonly omittedPaths: readonly string[];
  readonly manifestSha256: string;
}

export interface SecretFinding {
  readonly kind: 'secret';
  readonly path: string;
  readonly line: number;
  readonly rule: string;
  readonly redacted: string;
}

export interface RedactionResult {
  readonly files: readonly SourceFile[];
  readonly findings: readonly SecretFinding[];
  readonly scannerVersion: string;
  readonly packetSha256: string;
}

export interface SymbolRecord {
  readonly name: string;
  readonly kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'variable' | 'import' | 'export';
  readonly path: string;
  readonly start: number;
  readonly end: number;
}

export interface ContextPacket {
  readonly files: readonly SourceFile[];
  readonly symbols: readonly SymbolRecord[];
  readonly evidence: readonly EvidenceRef[];
  readonly secretFindings: readonly SecretFinding[];
  readonly omittedPaths: readonly string[];
  readonly snapshotId: SnapshotId;
}

export interface Candidate {
  readonly candidateId: string;
  readonly category: CandidateCategory;
  readonly severity: Severity;
  readonly title: string;
  readonly trigger: string;
  readonly expected: string;
  readonly actual: string;
  readonly impact: string;
  readonly changeRelevance: 'introduced' | 'worsened' | 'pre_existing' | 'uncertain';
  readonly causalChangeRef: readonly EvidenceRef[];
  readonly evidence: readonly EvidenceRef[];
  readonly verificationKind: 'model_assessment' | 'deterministic_analysis';
  readonly status: 'candidate';
}

export interface Verification {
  readonly candidateId: string;
  readonly decision: VerificationDecision;
  readonly evidenceChecked: readonly string[];
  readonly causalLink: Candidate['changeRelevance'];
  readonly verificationKind: 'model_assessment' | 'deterministic_analysis';
  readonly reason: string;
  readonly uncertainty: string;
}

export interface FindingOccurrence {
  readonly findingId: FindingId;
  readonly occurrenceId: string;
  readonly evidenceVersion: string;
  readonly candidate: Candidate;
  readonly verification: Verification;
}

export interface ReviewResult {
  readonly reviewId: ReviewId;
  readonly snapshot: Snapshot;
  readonly profile: ReviewProfile;
  readonly outcome: ReviewOutcome;
  readonly candidates: readonly Candidate[];
  readonly verifications: readonly Verification[];
  readonly findings: readonly FindingOccurrence[];
  readonly secretFindings: readonly SecretFinding[];
  readonly coverage: {
    readonly selectedPaths: readonly string[];
    readonly omittedPaths: readonly string[];
    readonly complete: boolean;
  };
  readonly attempts: number;
  readonly estimatedCostUsd: number;
  readonly error?: string;
}

export interface ProviderRequest {
  readonly role: 'correctness' | 'security' | 'verifier' | 'follow_up';
  readonly snapshotId: SnapshotId;
  readonly packet: ContextPacket;
  readonly candidates?: readonly Candidate[];
  readonly requestId: string;
  readonly maxOutputTokens?: number;
}

export interface ProviderResponse {
  readonly candidates?: readonly Candidate[];
  readonly verifications?: readonly Verification[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly rawStatus: 'ok' | 'incomplete';
}

export interface ProviderAdapter {
  readonly route: ProviderRoute;
  review(request: ProviderRequest): Promise<ProviderResponse>;
}

export interface ProviderRoute {
  readonly profile: Exclude<ReviewProfile, 'static_only'>;
  readonly provider: 'openai' | 'tokenrouter';
  readonly modelId: string;
  readonly baseUrl: string;
  readonly apiFormat: 'responses';
  readonly reasoning: 'none' | 'medium';
  readonly structuredOutput: 'json_schema';
  readonly toolMode: 'server_built_packet';
  readonly inputPricePerMillion: number;
  readonly outputPricePerMillion: number;
}

export interface ReviewConfig {
  readonly root: string;
  readonly dataDir: string;
  readonly profile: ReviewProfile;
  readonly maxAttempts: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxPacketBytes: number;
  readonly maxInlineFindings: number;
  readonly cloudBudgetUsd: number;
  readonly openAiApiKey?: string;
  readonly tokenRouterApiKey?: string;
  readonly tokenRouterBaseUrl?: string;
  readonly tokenRouterModelId?: string;
  /** GitHub App credentials used for publication. Personal GitHub tokens are never used by pr-review. */
  readonly githubAppId?: string;
  readonly githubAppInstallationId?: string;
  readonly githubAppPrivateKeyFile?: string;
  readonly githubAppPrivateKey?: string;
  /** Optional read-only token for previewing private PRs. It cannot publish reviews. */
  readonly githubToken?: string;
  readonly githubRepositories?: readonly RepositoryRef[];
  readonly pollIntervalMs?: number;
  readonly includeDrafts?: boolean;
  readonly maxAutomaticReviewsPerPoll?: number;
  readonly updatePullRequestDescription?: boolean;
  readonly autoMerge?: boolean;
}

export interface RepositoryRef {
  readonly owner: string;
  readonly repo: string;
}
