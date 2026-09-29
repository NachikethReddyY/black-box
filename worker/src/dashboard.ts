import { object } from "./github";
import type { WorkerEnv } from "./types";
import { latestHostTelemetry, type HostTelemetry } from "./host";

export interface DashboardRun {
  readonly id: number;
  readonly name: string;
  readonly title: string;
  readonly repo: string;
  readonly branch: string;
  readonly event: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly durationSeconds: number;
  readonly runNumber: number;
  readonly attempt: number;
  readonly headSha: string;
  readonly htmlUrl: string;
}

export interface DashboardJob {
  readonly id: number;
  readonly runId: number;
  readonly repo: string;
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly durationSeconds: number | null;
  readonly htmlUrl: string;
}

export interface DashboardRepository {
  readonly fullName: string;
  readonly private: boolean;
  readonly htmlUrl: string;
  readonly defaultBranch: string;
}

export interface DashboardUser {
  readonly login: string;
  readonly name: string | null;
  readonly avatarUrl: string | null;
}

export interface DashboardPayload {
  readonly user: DashboardUser;
  readonly repositories: readonly DashboardRepository[];
  readonly runs: readonly DashboardRun[];
  readonly jobs: readonly DashboardJob[];
  readonly fetchedAt: string;
  readonly host: HostTelemetry | null;
  readonly warnings: readonly DashboardWarning[];
}

export type DashboardWarningCode =
  | "installation_visibility_limited"
  | "repositories_unavailable"
  | "repository_runs_unavailable"
  | "repository_jobs_unavailable"
  | "host_telemetry_restricted"
  | "host_telemetry_unavailable";

export interface DashboardWarning {
  readonly code: DashboardWarningCode;
  readonly message: string;
  readonly repository?: string;
}

export interface DashboardLogLine {
  readonly level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  readonly message: string;
}

interface SessionRow {
  session_id: string;
  token_ciphertext: string;
  user_json: string;
  created_at: number;
  expires_at: number;
}

const SESSION_COOKIE = "__Host-blackbox_session";
const STATE_COOKIE = "__Host-blackbox_oauth_state";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOG_BYTES = 2 * 1024 * 1024;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) throw new Error("invalid_base64url");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomToken(byteLength = 24): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptToken(token: string, secret: string): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(secret), new TextEncoder().encode(token));
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encrypted))}`;
}

async function decryptToken(ciphertext: string, secret: string): Promise<string | null> {
  try {
    if (typeof ciphertext !== "string") return null;
    const parts = ciphertext.split(".");
    if (parts.length !== 2) return null;
    const [ivText, bodyText] = parts;
    if (!ivText || !bodyText) return null;
    const iv = base64UrlToBytes(ivText);
    if (iv.byteLength !== 12) return null;
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(ivText) }, await encryptionKey(secret), base64UrlToBytes(bodyText));
    const token = new TextDecoder().decode(decrypted);
    return /^\S{1,2048}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(value.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

function cookie(name: string, value: string, maxAge: number, sameSite: "Lax" | "None" = "Lax"): string {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=${sameSite}`;
}

function dashboardOrigin(env: WorkerEnv): string | null {
  if (!env.DASHBOARD_ORIGIN) return null;
  try {
    const origin = new URL(env.DASHBOARD_ORIGIN);
    if (origin.protocol !== "http:" && origin.protocol !== "https:") return null;
    return origin.origin;
  } catch {
    return null;
  }
}

function corsHeaders(request: Request, env: WorkerEnv): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (origin && origin === dashboardOrigin(env)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Vary", "Origin");
  }
  return headers;
}

export function dashboardJson(request: Request, env: WorkerEnv, body: unknown, status = 200): Response {
  const headers = corsHeaders(request, env);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function redirectTarget(request: Request, env: WorkerEnv): string {
  return dashboardOrigin(env) ?? new URL(request.url).origin;
}

function sessionSameSite(request: Request, env: WorkerEnv): "Lax" | "None" {
  const configuredOrigin = dashboardOrigin(env);
  return configuredOrigin && configuredOrigin !== new URL(request.url).origin ? "None" : "Lax";
}

function configured(env: WorkerEnv): env is WorkerEnv & Required<Pick<WorkerEnv, "GITHUB_OAUTH_CLIENT_ID" | "GITHUB_OAUTH_CLIENT_SECRET" | "DASHBOARD_SESSION_SECRET">> {
  return Boolean(env.GITHUB_OAUTH_CLIENT_ID?.trim() && env.GITHUB_OAUTH_CLIENT_SECRET?.trim() && env.DASHBOARD_SESSION_SECRET?.trim());
}

function validRepository(value: string | null): value is string {
  return value !== null && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function validId(value: string | null): value is string {
  return value !== null && /^\d{1,20}$/.test(value);
}

function validCookieToken(value: string | null): value is string {
  return value !== null && /^[A-Za-z0-9_-]{1,256}$/.test(value);
}

function iso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function secondsBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const value = Math.round((Date.parse(end) - Date.parse(start)) / 1000);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function normalizeGitHubRun(value: unknown, repo: string): DashboardRun | null {
  const row = object(value);
  if (!row) return null;
  const id = row?.id, name = row?.name, title = row?.display_title, event = row?.event, status = row?.status;
  const createdAt = iso(row?.created_at), updatedAt = iso(row?.updated_at);
  const htmlUrl = row?.html_url, runNumber = row?.run_number, attempt = row?.run_attempt, headSha = row?.head_sha;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || typeof name !== "string" || typeof title !== "string" || typeof event !== "string" || typeof status !== "string" || !createdAt || !updatedAt || typeof htmlUrl !== "string" || typeof runNumber !== "number" || typeof attempt !== "number" || typeof headSha !== "string") return null;
  return { id, name, title, repo, branch: typeof row.head_branch === "string" ? row.head_branch : "—", event, status, conclusion: typeof row.conclusion === "string" ? row.conclusion : null, createdAt, updatedAt, durationSeconds: secondsBetween(createdAt, updatedAt) ?? 0, runNumber, attempt, headSha, htmlUrl };
}

function normalizeRepository(value: unknown): DashboardRepository | null {
  const row = object(value), fullName = row?.full_name;
  if (!row) return null;
  const htmlUrl = row?.html_url;
  if (typeof fullName !== "string" || !validRepository(fullName) || typeof htmlUrl !== "string") return null;
  return { fullName, private: row?.private === true, htmlUrl, defaultBranch: typeof row?.default_branch === "string" ? row.default_branch : "main" };
}

function normalizeJob(value: unknown, repo: string, runId: number): DashboardJob | null {
  const row = object(value);
  if (!row) return null;
  const id = row?.id, name = row?.name, status = row?.status, htmlUrl = row?.html_url;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || typeof name !== "string" || typeof status !== "string" || typeof htmlUrl !== "string") return null;
  const startedAt = iso(row.started_at), completedAt = iso(row.completed_at);
  return { id, runId, repo, name, status, conclusion: typeof row.conclusion === "string" ? row.conclusion : null, startedAt, completedAt, durationSeconds: secondsBetween(startedAt, completedAt), htmlUrl };
}

export function parseLogLines(text: string): DashboardLogLine[] {
  return text.split(/\r?\n/).filter((line) => line.length > 0).map((line) => {
    if (/^warning\b/i.test(line)) return { level: "WARN" as const, message: line };
    const match = /^(?:\[)?(INFO|WARN|ERROR|DEBUG)(?:\])?(?:\s*[:|-]\s*|\s+)(.*)$/i.exec(line);
    if (!match) return { level: "INFO" as const, message: line };
    return { level: match[1].toUpperCase() as DashboardLogLine["level"], message: match[2] };
  });
}

async function githubJson(token: string, suffix: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`https://api.github.com${suffix}`, {
    ...init,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Black-Box-Dashboard", ...init.headers },
  });
  if (!response.ok) throw new GitHubRequestError(response.status);
  return response.json();
}

class GitHubRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`github_http_${status}`);
    this.name = "GitHubRequestError";
    this.status = status;
  }
}

function dashboardUser(value: unknown): DashboardUser | null {
  const row = object(value);
  if (!row || typeof row.login !== "string" || !/^[A-Za-z0-9_.-]{1,39}$/.test(row.login)) return null;
  const name = row.name;
  if (name !== undefined && name !== null && typeof name !== "string") return null;
  const avatarUrl = "avatar_url" in row ? row.avatar_url : row.avatarUrl;
  if (avatarUrl !== undefined && avatarUrl !== null && typeof avatarUrl !== "string") return null;
  return {
    login: row.login,
    name: name ?? null,
    avatarUrl: avatarUrl ?? null,
  };
}

function warningFor(
  code: Exclude<DashboardWarningCode, "installation_visibility_limited" | "host_telemetry_restricted">,
  message: string,
  error: unknown,
  repository?: string,
): DashboardWarning {
  const detail = error instanceof GitHubRequestError ? ` (GitHub returned HTTP ${error.status}.)` : "";
  return { code, message: `${message}${detail}`, ...(repository ? { repository } : {}) };
}

function trustedActor(login: string, env: WorkerEnv): boolean {
  const configured = typeof env.TRUSTED_ACTORS === "string" ? env.TRUSTED_ACTORS : "";
  return configured.split(",").some((actor) => actor.trim().toLowerCase() === login.toLowerCase());
}

async function sessionRow(request: Request, env: WorkerEnv): Promise<{ id: string; token: string; user: DashboardUser } | null> {
  if (!env.DASHBOARD_SESSION_SECRET) return null;
  const id = cookieValue(request, SESSION_COOKIE);
  if (!validCookieToken(id)) return null;
  try {
    const row = await env.DB.prepare("SELECT * FROM dashboard_sessions WHERE session_id=? AND expires_at>? LIMIT 1").bind(id, Date.now()).first<SessionRow>();
    if (!row || typeof row.token_ciphertext !== "string" || typeof row.user_json !== "string") return null;
    const token = await decryptToken(row.token_ciphertext, env.DASHBOARD_SESSION_SECRET);
    if (!token) return null;
    const user = dashboardUser(JSON.parse(row.user_json));
    return user ? { id, token, user } : null;
  } catch {
    return null;
  }
}

async function dashboardData(token: string, user: DashboardUser, env: WorkerEnv): Promise<DashboardPayload> {
  const warnings: DashboardWarning[] = [{
    code: "installation_visibility_limited",
    message: "GitHub App access is limited to repositories available to this app installation and the signed-in user.",
  }];
  let repoPayload: unknown = [];
  try {
    repoPayload = await githubJson(token, "/user/repos?per_page=50&sort=updated&affiliation=owner,collaborator,organization_member");
  } catch (error) {
    warnings.push(warningFor("repositories_unavailable", "Repository access is temporarily unavailable.", error));
  }
  const repositories = Array.isArray(repoPayload) ? repoPayload.map(normalizeRepository).filter((repo): repo is DashboardRepository => repo !== null) : [];
  const visibleRepos = repositories.slice(0, 16);
  const runGroups = await Promise.all(visibleRepos.map(async (repo) => {
    try {
      const payload = object(await githubJson(token, `/repos/${repo.fullName.split("/").map(encodeURIComponent).join("/")}/actions/runs?per_page=25`));
      if (!Array.isArray(payload?.workflow_runs)) return { runs: [] as DashboardRun[], warning: null };
      return { runs: payload.workflow_runs.map((run) => normalizeGitHubRun(run, repo.fullName)).filter((run): run is DashboardRun => run !== null), warning: null };
    } catch (error) {
      return { runs: [] as DashboardRun[], warning: warningFor("repository_runs_unavailable", "Workflow runs are unavailable for this repository.", error, repo.fullName) };
    }
  }));
  for (const group of runGroups) if (group.warning) warnings.push(group.warning);
  const runs = runGroups.flatMap((group) => group.runs).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 100);
  const jobs = (await Promise.all(runs.slice(0, 8).map(async (run) => {
    try {
      const suffix = `/repos/${run.repo.split("/").map(encodeURIComponent).join("/")}/actions/runs/${run.id}/jobs?per_page=100`;
      const payload = object(await githubJson(token, suffix));
      if (!Array.isArray(payload?.jobs)) return { jobs: [] as DashboardJob[], warning: null };
      return { jobs: payload.jobs.map((job) => normalizeJob(job, run.repo, run.id)).filter((job): job is DashboardJob => job !== null), warning: null };
    } catch (error) {
      return { jobs: [] as DashboardJob[], warning: warningFor("repository_jobs_unavailable", "Workflow jobs are unavailable for this repository.", error, run.repo) };
    }
  })));
  for (const group of jobs) if (group.warning) warnings.push(group.warning);
  const jobRows = jobs.flatMap((group) => group.jobs);
  let host: HostTelemetry | null = null;
  if (trustedActor(user.login, env)) {
    try {
      host = await latestHostTelemetry(env.DB);
    } catch {
      warnings.push({ code: "host_telemetry_unavailable", message: "Host telemetry is temporarily unavailable." });
    }
  } else {
    warnings.push({ code: "host_telemetry_restricted", message: "Host telemetry is available only to configured trusted actors." });
  }
  return { user, repositories, runs, jobs: jobRows, host, warnings, fetchedAt: new Date().toISOString() };
}

async function readLog(request: Request, token: string): Promise<Response> {
  const url = new URL(request.url), repo = url.searchParams.get("repo"), jobId = url.searchParams.get("job_id");
  if (!validRepository(repo) || !validId(jobId)) return new Response(JSON.stringify({ error: "invalid_log_target" }), { status: 400, headers: { "Content-Type": "application/json" } });
  let response: Response;
  try {
    response = await fetch(`https://api.github.com/repos/${repo.split("/").map(encodeURIComponent).join("/")}/actions/jobs/${jobId}/logs`, { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Black-Box-Dashboard" } });
  } catch {
    return new Response(JSON.stringify({ error: "github_unavailable" }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
  if (!response.ok) return new Response(JSON.stringify({ error: `github_http_${response.status}` }), { status: response.status, headers: { "Content-Type": "application/json" } });
  const reader = response.body?.getReader();
  if (!reader) return new Response("", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const decoder = new TextDecoder(); let text = "", size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > MAX_LOG_BYTES) { await reader.cancel(); text += "\n[Black Box truncated this log at 2 MiB]"; break; }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  return new Response(JSON.stringify({ lines: parseLogLines(text) }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

async function oauthStart(request: Request, env: WorkerEnv): Promise<Response> {
  if (!configured(env)) return dashboardJson(request, env, { error: "dashboard_auth_not_configured" }, 503);
  const state = randomToken();
  const callback = new URL("/auth/github/callback", request.url).toString();
  const target = new URL("https://github.com/login/oauth/authorize");
  target.searchParams.set("client_id", env.GITHUB_OAUTH_CLIENT_ID);
  target.searchParams.set("redirect_uri", callback);
  target.searchParams.set("state", state);
  return new Response(null, { status: 302, headers: { Location: target.toString(), "Set-Cookie": cookie(STATE_COOKIE, state, 600) } });
}

async function oauthCallback(request: Request, env: WorkerEnv): Promise<Response> {
  if (!configured(env)) return dashboardJson(request, env, { error: "dashboard_auth_not_configured" }, 503);
  const url = new URL(request.url), code = url.searchParams.get("code"), state = url.searchParams.get("state");
  if (!code || !/^[A-Za-z0-9_-]{16,256}$/.test(state ?? "") || state !== cookieValue(request, STATE_COOKIE)) return dashboardJson(request, env, { error: "oauth_state_mismatch" }, 400);
  const callback = new URL("/auth/github/callback", request.url).toString();
  let tokenResponse: Response;
  let tokenPayload: Record<string, unknown> | null;
  try {
    tokenResponse = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ client_id: env.GITHUB_OAUTH_CLIENT_ID, client_secret: env.GITHUB_OAUTH_CLIENT_SECRET, code, redirect_uri: callback }) });
    tokenPayload = object(await tokenResponse.json());
  } catch {
    return dashboardJson(request, env, { error: "oauth_token_exchange_failed" }, 502);
  }
  if (!tokenResponse.ok || typeof tokenPayload?.access_token !== "string") return dashboardJson(request, env, { error: "oauth_token_exchange_failed" }, 502);
  let user: DashboardUser | null;
  try {
    user = dashboardUser(await githubJson(tokenPayload.access_token, "/user"));
  } catch {
    user = null;
  }
  if (!user) return dashboardJson(request, env, { error: "github_profile_failed" }, 502);
  const sessionId = randomToken();
  const encrypted = await encryptToken(tokenPayload.access_token, env.DASHBOARD_SESSION_SECRET);
  const now = Date.now();
  try {
    await env.DB.prepare("INSERT INTO dashboard_sessions (session_id,token_ciphertext,user_json,created_at,expires_at) VALUES (?,?,?,?,?)").bind(sessionId, encrypted, JSON.stringify(user), now, now + SESSION_TTL_MS).run();
  } catch {
    return dashboardJson(request, env, { error: "dashboard_session_unavailable" }, 503);
  }
  const headers = new Headers({ Location: `${redirectTarget(request, env)}/` });
  headers.append("Set-Cookie", cookie(SESSION_COOKIE, sessionId, SESSION_TTL_MS / 1000, sessionSameSite(request, env)));
  headers.append("Set-Cookie", cookie(STATE_COOKIE, "", 0));
  return new Response(null, { status: 302, headers });
}

function sameOriginRequest(request: Request, env: WorkerEnv): boolean {
  const sources = [request.headers.get("Origin"), request.headers.get("Referer")].filter((source): source is string => Boolean(source));
  if (sources.length === 0) return false;
  const allowed = new Set([new URL(request.url).origin, dashboardOrigin(env)]);
  for (const source of sources) {
    try {
      if (!allowed.has(new URL(source).origin)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export async function handleDashboardRequest(request: Request, env: WorkerEnv): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/") && !path.startsWith("/auth/")) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...Object.fromEntries(corsHeaders(request, env)), "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } });
  if (path === "/auth/github" && request.method === "GET") return oauthStart(request, env);
  if (path === "/auth/github/callback" && request.method === "GET") return oauthCallback(request, env);
  if (path === "/auth/logout" && request.method === "POST") {
    if (!sameOriginRequest(request, env)) return dashboardJson(request, env, { error: "same_origin_required" }, 403);
    const id = cookieValue(request, SESSION_COOKIE);
    if (validCookieToken(id)) {
      try { await env.DB.prepare("DELETE FROM dashboard_sessions WHERE session_id=?").bind(id).run(); } catch { /* clearing the cookie still logs the browser out */ }
    }
    return new Response(null, { status: 204, headers: { "Set-Cookie": cookie(SESSION_COOKIE, "", 0, sessionSameSite(request, env)) } });
  }
  const session = await sessionRow(request, env);
  if (!session) return dashboardJson(request, env, { error: "authentication_required", login_url: "/auth/github" }, 401);
  if (path === "/api/session" && request.method === "GET") return dashboardJson(request, env, { authenticated: true, user: session.user }, 200);
  if (path === "/api/dashboard" && request.method === "GET") {
    try { return dashboardJson(request, env, await dashboardData(session.token, session.user, env)); }
    catch (error) { return dashboardJson(request, env, { error: error instanceof Error ? error.message : "dashboard_fetch_failed" }, 502); }
  }
  if (path === "/api/job-logs" && request.method === "GET") {
    const response = await readLog(request, session.token);
    const headers = corsHeaders(request, env); response.headers.forEach((value, key) => headers.set(key, value)); return new Response(response.body, { status: response.status, headers });
  }
  return dashboardJson(request, env, { error: "not_found" }, 404);
}
