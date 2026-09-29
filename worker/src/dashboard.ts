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
  const [ivText, bodyText] = ciphertext.split(".");
  if (!ivText || !bodyText) return null;
  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(ivText) }, await encryptionKey(secret), base64UrlToBytes(bodyText));
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("Cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=None`;
}

function corsHeaders(request: Request, env: WorkerEnv): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (origin && env.DASHBOARD_ORIGIN && origin === env.DASHBOARD_ORIGIN.replace(/\/$/, "")) {
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
  return (env.DASHBOARD_ORIGIN ?? new URL(request.url).origin).replace(/\/$/, "");
}

function configured(env: WorkerEnv): env is WorkerEnv & Required<Pick<WorkerEnv, "GITHUB_OAUTH_CLIENT_ID" | "GITHUB_OAUTH_CLIENT_SECRET" | "DASHBOARD_SESSION_SECRET">> {
  return Boolean(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET && env.DASHBOARD_SESSION_SECRET);
}

function validRepository(value: string | null): value is string {
  return value !== null && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function validId(value: string | null): value is string {
  return value !== null && /^\d{1,20}$/.test(value);
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
  if (!response.ok) throw new Error(`github_http_${response.status}`);
  return response.json();
}

async function sessionRow(request: Request, env: WorkerEnv): Promise<{ id: string; token: string; user: DashboardUser } | null> {
  if (!env.DASHBOARD_SESSION_SECRET) return null;
  const id = cookieValue(request, SESSION_COOKIE);
  if (!id) return null;
  const row = await env.DB.prepare("SELECT * FROM dashboard_sessions WHERE session_id=? AND expires_at>? LIMIT 1").bind(id, Date.now()).first<SessionRow>();
  if (!row) return null;
  const token = await decryptToken(row.token_ciphertext, env.DASHBOARD_SESSION_SECRET);
  if (!token) return null;
  try {
    const user = JSON.parse(row.user_json) as DashboardUser;
    if (typeof user.login !== "string") return null;
    return { id, token, user };
  } catch {
    return null;
  }
}

async function dashboardData(token: string, user: DashboardUser, env: WorkerEnv): Promise<DashboardPayload> {
  const repoPayload = await githubJson(token, "/user/repos?per_page=50&sort=updated&affiliation=owner,collaborator,organization_member");
  const repositories = Array.isArray(repoPayload) ? repoPayload.map(normalizeRepository).filter((repo): repo is DashboardRepository => repo !== null) : [];
  const visibleRepos = repositories.slice(0, 16);
  const runGroups = await Promise.all(visibleRepos.map(async (repo) => {
    const payload = object(await githubJson(token, `/repos/${repo.fullName.split("/").map(encodeURIComponent).join("/")}/actions/runs?per_page=25`));
    if (!Array.isArray(payload?.workflow_runs)) return [];
    return payload.workflow_runs.map((run) => normalizeGitHubRun(run, repo.fullName)).filter((run): run is DashboardRun => run !== null);
  }));
  const runs = runGroups.flat().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 100);
  const jobs = (await Promise.all(runs.slice(0, 8).map(async (run) => {
    const suffix = `/repos/${run.repo.split("/").map(encodeURIComponent).join("/")}/actions/runs/${run.id}/jobs?per_page=100`;
    const payload = object(await githubJson(token, suffix));
    if (!Array.isArray(payload?.jobs)) return [];
    return payload.jobs.map((job) => normalizeJob(job, run.repo, run.id)).filter((job): job is DashboardJob => job !== null);
  }))).flat();
  return { user, repositories, runs, jobs, host: await latestHostTelemetry(env.DB), fetchedAt: new Date().toISOString() };
}

async function readLog(request: Request, token: string): Promise<Response> {
  const url = new URL(request.url), repo = url.searchParams.get("repo"), jobId = url.searchParams.get("job_id");
  if (!validRepository(repo) || !validId(jobId)) return new Response(JSON.stringify({ error: "invalid_log_target" }), { status: 400, headers: { "Content-Type": "application/json" } });
  const response = await fetch(`https://api.github.com/repos/${repo.split("/").map(encodeURIComponent).join("/")}/actions/jobs/${jobId}/logs`, { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Black-Box-Dashboard" } });
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
  target.searchParams.set("scope", "read:user repo workflow");
  target.searchParams.set("state", state);
  return new Response(null, { status: 302, headers: { Location: target.toString(), "Set-Cookie": cookie(STATE_COOKIE, state, 600) } });
}

async function oauthCallback(request: Request, env: WorkerEnv): Promise<Response> {
  if (!configured(env)) return dashboardJson(request, env, { error: "dashboard_auth_not_configured" }, 503);
  const url = new URL(request.url), code = url.searchParams.get("code"), state = url.searchParams.get("state");
  if (!code || !state || state !== cookieValue(request, STATE_COOKIE)) return dashboardJson(request, env, { error: "oauth_state_mismatch" }, 400);
  const callback = new URL("/auth/github/callback", request.url).toString();
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ client_id: env.GITHUB_OAUTH_CLIENT_ID, client_secret: env.GITHUB_OAUTH_CLIENT_SECRET, code, redirect_uri: callback }) });
  const tokenPayload = object(await tokenResponse.json());
  if (!tokenResponse.ok || typeof tokenPayload?.access_token !== "string") return dashboardJson(request, env, { error: "oauth_token_exchange_failed" }, 502);
  const profile = object(await githubJson(tokenPayload.access_token, "/user"));
  if (typeof profile?.login !== "string") return dashboardJson(request, env, { error: "github_profile_failed" }, 502);
  const user: DashboardUser = { login: profile.login, name: typeof profile.name === "string" ? profile.name : null, avatarUrl: typeof profile.avatar_url === "string" ? profile.avatar_url : null };
  const sessionId = randomToken();
  const encrypted = await encryptToken(tokenPayload.access_token, env.DASHBOARD_SESSION_SECRET);
  const now = Date.now();
  await env.DB.prepare("INSERT INTO dashboard_sessions (session_id,token_ciphertext,user_json,created_at,expires_at) VALUES (?,?,?,?,?)").bind(sessionId, encrypted, JSON.stringify(user), now, now + SESSION_TTL_MS).run();
  const headers = new Headers({ Location: `${redirectTarget(request, env)}/` });
  headers.append("Set-Cookie", cookie(SESSION_COOKIE, sessionId, SESSION_TTL_MS / 1000));
  headers.append("Set-Cookie", cookie(STATE_COOKIE, "", 0));
  return new Response(null, { status: 302, headers });
}

export async function handleDashboardRequest(request: Request, env: WorkerEnv): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/") && !path.startsWith("/auth/")) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...Object.fromEntries(corsHeaders(request, env)), "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } });
  if (path === "/auth/github" && request.method === "GET") return oauthStart(request, env);
  if (path === "/auth/github/callback" && request.method === "GET") return oauthCallback(request, env);
  if (path === "/auth/logout" && request.method === "POST") {
    const id = cookieValue(request, SESSION_COOKIE);
    if (id) await env.DB.prepare("DELETE FROM dashboard_sessions WHERE session_id=?").bind(id).run();
    return new Response(null, { status: 204, headers: { "Set-Cookie": cookie(SESSION_COOKIE, "", 0) } });
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
