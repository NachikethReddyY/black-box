export const RUNNERS = ['home', 'github', 'blacksmith', 'waiting'] as const;
export const REQUIRED_JOB_NAMES = ['local-checks', 'local-postgres', 'source-and-dependencies', 'dast-tooling'] as const;
export type Runner = typeof RUNNERS[number];
export type WorkflowRunner = Exclude<Runner, 'waiting'>;
export type SourceEvent = 'pull_request' | 'push' | 'schedule' | 'manual';
export type RequestState = 'pending' | 'claimed' | 'dispatched' | 'ambiguous' | 'completed' | 'superseded';
export interface DispatcherConfig {
  readonly trustedRepositories: ReadonlySet<string>;
  readonly trustedActors: ReadonlySet<string>;
  readonly runnerOrder: readonly Runner[];
  readonly paidFallbacksEnabled: boolean;
  readonly workflowFile: string;
  readonly workflowRef: string;
  readonly homeRunnerLabel: string;
  readonly githubApiBaseUrl: string;
  readonly maxAttempts: number;
}
export interface DispatchRequest {
  readonly requestId: string;
  readonly eventId: string;
  readonly repository: string;
  readonly actor: string;
  readonly sourceEvent: SourceEvent;
  readonly workflowFile: string;
  readonly workflowRef: string;
  readonly sourceRef: string;
  readonly prNumber: string;
  readonly commitSha: string;
  readonly headSha: string;
  readonly baseSha: string;
  readonly mergeReady: boolean;
  readonly runner: Runner;
}
export interface RequestRecord extends DispatchRequest {
  readonly state: RequestState;
  readonly attemptCount: number;
  readonly nextAttemptAt: number;
  readonly workflowRunId?: number;
  readonly workflowRunAttempt?: number;
  readonly checks: Readonly<Record<string, number>>;
  readonly conclusion?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly expiresAt: number;
  readonly lastError?: string;
}
export interface WorkflowDispatchInput {
  readonly ref: string;
  readonly inputs: {
    readonly runner: WorkflowRunner;
    readonly commit_sha: string;
    readonly head_sha: string;
    readonly request_id: string;
    readonly source_ref: string;
    readonly pr_number: string;
    readonly source_event: SourceEvent;
  };
}
export interface JobResult { readonly conclusion: string | null; readonly checkoutVerified: boolean }
export interface WorkflowRun {
  readonly id: number;
  readonly attempt: number;
  readonly status: string;
  readonly conclusion: string | null;
  readonly htmlUrl: string;
  readonly jobs: Readonly<Record<string, JobResult>>;
}
export interface PullRequest {
  readonly headSha: string;
  readonly baseSha: string;
  readonly mergeCommitSha: string | null;
  readonly mergeable: boolean | null;
  readonly open: boolean;
}
export interface GitHubApi {
  dispatchWorkflow(input: WorkflowDispatchInput, repository: string, workflowFile: string): Promise<number | undefined>;
  findWorkflowRun(request: RequestRecord): Promise<WorkflowRun | null>;
  ensureCheck(request: RequestRecord, name: string): Promise<number>;
  updateCheck(request: RequestRecord, name: string, state: 'queued' | 'in_progress' | 'success' | 'failure' | 'cancelled' | 'action_required', summary: string, detailsUrl?: string): Promise<void>;
  getPullRequest(repository: string, number: number): Promise<PullRequest>;
  listAvailableRunners(repository: string): Promise<ReadonlySet<Runner>>;
  getBranchSha(repository: string, branch: string): Promise<string>;
}
export interface WorkerEnv {
  readonly DB: D1Database;
  readonly ASSETS?: Fetcher;
  readonly HOST_AGENT_TOKEN?: string;
  readonly WEBHOOK_SECRET: string;
  readonly OPERATOR_TOKEN?: string;
  readonly TRUSTED_REPOSITORIES: string;
  readonly TRUSTED_ACTORS: string;
  readonly DISPATCH_RUNNERS?: string;
  readonly ENABLE_PAID_FALLBACKS?: string;
  readonly GITHUB_WORKFLOW_FILE?: string;
  readonly GITHUB_WORKFLOW_REF?: string;
  readonly HOME_RUNNER_LABEL?: string;
  readonly GITHUB_APP_ID: string;
  readonly GITHUB_APP_PRIVATE_KEY: string;
  readonly GITHUB_APP_INSTALLATION_ID: string;
  readonly GITHUB_OAUTH_CLIENT_ID?: string;
  readonly GITHUB_OAUTH_CLIENT_SECRET?: string;
  readonly DASHBOARD_SESSION_SECRET?: string;
  readonly DASHBOARD_ORIGIN?: string;
}
export function requiredJobs(request: Pick<DispatchRequest, 'sourceEvent'>): readonly string[] {
  return request.sourceEvent === 'schedule' ? REQUIRED_JOB_NAMES.slice(2) : REQUIRED_JOB_NAMES;
}
