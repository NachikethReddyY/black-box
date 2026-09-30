export type DashboardUser = {
  login: string;
  name: string | null;
  avatarUrl: string | null;
};

export type DashboardRepository = {
  fullName: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
};

export type DashboardRun = {
  id: number;
  name: string;
  title: string;
  repo: string;
  branch: string;
  event: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  updatedAt: string;
  durationSeconds: number;
  runNumber: number;
  attempt: number;
  headSha: string;
  htmlUrl: string;
};

export type DashboardJob = {
  id: number;
  runId: number;
  repo: string;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  htmlUrl: string;
};

export type HostTelemetry = {
  hostId: string;
  hostname: string;
  runnerName: string;
  cpuPercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  diskFreeBytes: number;
  diskTotalBytes: number;
  wslMemoryLimitBytes: number | null;
  dockerReady: boolean;
  observedAt: string;
  ageSeconds: number;
  status: "online" | "stale";
};

export type DashboardPayload = {
  user: DashboardUser;
  repositories: DashboardRepository[];
  runs: DashboardRun[];
  jobs: DashboardJob[];
  host: HostTelemetry | null;
  warnings?: DashboardWarning[];
  fetchedAt: string;
};

export type DashboardWarning = {
  code: string;
  message: string;
  repository?: string;
};

export type DashboardLogLine = {
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  message: string;
};

export type DashboardApi = {
  baseUrl: string;
  getDashboard(): Promise<DashboardPayload>;
  getJobLogs(job: DashboardJob): Promise<DashboardLogLine[]>;
  logout(): Promise<void>;
};

const baseUrl = (import.meta.env.VITE_BLACKBOX_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { ...init, credentials: "include", headers: { Accept: "application/json", ...init?.headers } });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : `request_failed_${response.status}`;
    const error = new Error(message);
    Object.assign(error, { status: response.status, payload });
    throw error;
  }
  return payload as T;
}

export const dashboardApi: DashboardApi = {
  baseUrl,
  getDashboard: () => request<DashboardPayload>("/api/dashboard"),
  getJobLogs: (job) => request<{ lines: DashboardLogLine[] }>(`/api/job-logs?repo=${encodeURIComponent(job.repo)}&job_id=${job.id}`).then((payload) => payload.lines),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
};

export function apiErrorStatus(error: unknown): number | null {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : null;
}

export function apiErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "dashboard_request_failed";
}
