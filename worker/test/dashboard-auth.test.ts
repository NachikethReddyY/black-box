import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { URL } from "node:url";
import test from "node:test";
import { handleDashboardRequest } from "../src/dashboard";
import type { WorkerEnv } from "../src/types";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../migrations/0002_dashboard.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../migrations/0003_host_telemetry.sql", import.meta.url), "utf8"));
  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      let args: (string | number | null)[] = [];
      const query = {
        bind(...values: (string | number | null)[]) { args = values; return query; },
        async run() { const result = statement.run(...args); return { success: true, meta: { changes: Number(result.changes) } }; },
        async first<T>() { return (statement.get(...args) ?? null) as T | null; },
        async all<T>() { return { results: statement.all(...args) as T[], success: true }; },
      };
      return query;
    },
  } as unknown as D1Database;
  return { db, sqlite };
}

function envFor(db: D1Database, trustedActors = "trusted"): WorkerEnv {
  return {
    DB: db,
    WEBHOOK_SECRET: "webhook-secret",
    TRUSTED_REPOSITORIES: "acme/good",
    TRUSTED_ACTORS: trustedActors,
    GITHUB_APP_ID: "1",
    GITHUB_APP_INSTALLATION_ID: "2",
    GITHUB_APP_PRIVATE_KEY: "unused",
    GITHUB_OAUTH_CLIENT_ID: "client-id",
    GITHUB_OAUTH_CLIENT_SECRET: "client-secret",
    DASHBOARD_SESSION_SECRET: "session-secret",
  };
}

function cookiePair(setCookie: string | null, name: string): string {
  const value = setCookie?.split(";")[0];
  if (!value?.startsWith(`${name}=`)) throw new Error(`missing ${name} cookie`);
  return value;
}

test("auth handlers use GitHub App OAuth semantics and tolerate malformed session cookies", async () => {
  const { db, sqlite } = database();
  const env = envFor(db);
  const start = await handleDashboardRequest(new Request("https://blackbox.test/auth/github"), env);
  assert.equal(start?.status, 302);
  const location = new URL(start?.headers.get("Location") ?? "");
  assert.equal(location.searchParams.get("scope"), null);
  const stateSetCookie = start?.headers.get("Set-Cookie") ?? "";
  const stateCookie = cookiePair(stateSetCookie, "__Host-blackbox_oauth_state");
  assert.match(stateSetCookie, /SameSite=Lax/);
  const state = location.searchParams.get("state");
  assert.ok(state);

  const originalFetch = globalThis.fetch;
  const calls: { url: string; authorization: string | null }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, authorization: headers.get("Authorization") });
    if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "user-token" });
    if (url === "https://api.github.com/user") return Response.json({ login: "trusted", name: "Trusted", avatar_url: null });
    if (url.endsWith("/user/repos?per_page=50&sort=updated&affiliation=owner,collaborator,organization_member")) {
      return Response.json([
        { full_name: "acme/good", private: true, html_url: "https://github.com/acme/good", default_branch: "main" },
        { full_name: "acme/denied", private: true, html_url: "https://github.com/acme/denied", default_branch: "main" },
      ]);
    }
    if (url.endsWith("/repos/acme/good/actions/runs?per_page=25")) {
      return Response.json({ workflow_runs: [{ id: 7, name: "Checks", display_title: "Good", event: "push", status: "completed", conclusion: "success", created_at: "2026-09-29T07:00:00Z", updated_at: "2026-09-29T07:01:00Z", run_number: 1, run_attempt: 1, head_branch: "main", head_sha: "a", html_url: "https://github.com/acme/good/actions/runs/7" }] });
    }
    if (url.endsWith("/repos/acme/denied/actions/runs?per_page=25")) return new Response(null, { status: 403 });
    if (url.endsWith("/repos/acme/good/actions/runs/7/jobs?per_page=100")) return Response.json({ jobs: [] });
    throw new Error(`unexpected mocked request: ${url}`);
  };

  try {
    const callback = await handleDashboardRequest(new Request(`https://blackbox.test/auth/github/callback?code=code&state=${encodeURIComponent(state)}`, { headers: { Cookie: stateCookie } }), env);
    assert.equal(callback?.status, 302);
    const callbackCookies = callback?.headers.getSetCookie?.() ?? [];
    const sessionSetCookie = callbackCookies.find((value) => value.startsWith("__Host-blackbox_session=")) ?? callback?.headers.get("Set-Cookie") ?? "";
    const sessionCookie = cookiePair(sessionSetCookie, "__Host-blackbox_session");
    assert.match(sessionSetCookie, /SameSite=Lax/);

    sqlite.prepare("INSERT INTO host_telemetry (host_id,hostname,runner_name,cpu_percent,memory_used_bytes,memory_total_bytes,disk_free_bytes,disk_total_bytes,wsl_memory_limit_bytes,docker_ready,observed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run("host-1", "trusted-host", "runner", 12, 1, 2, 3, 4, null, 1, Date.now());
    const response = await handleDashboardRequest(new Request("https://blackbox.test/api/dashboard", { headers: { Cookie: sessionCookie } }), env);
    assert.equal(response?.status, 200);
    const payload = await response?.json() as { host: { hostId: string } | null; runs: unknown[]; warnings: { code: string; repository?: string }[] };
    assert.equal(payload.host?.hostId, "host-1");
    assert.equal(payload.runs.length, 1);
    assert.ok(payload.warnings.some((warning) => warning.code === "installation_visibility_limited"));
    assert.ok(payload.warnings.some((warning) => warning.code === "repository_runs_unavailable" && warning.repository === "acme/denied"));
    assert.ok(calls.filter((call) => call.url.includes("api.github.com")).every((call) => call.authorization === "Bearer user-token"));

    sqlite.prepare("UPDATE dashboard_sessions SET user_json=?").run(JSON.stringify({ login: "outsider", name: null, avatarUrl: null }));
    const outsider = await handleDashboardRequest(new Request("https://blackbox.test/api/dashboard", { headers: { Cookie: sessionCookie } }), env);
    const outsiderPayload = await outsider?.json() as { host: unknown; warnings: { code: string }[] };
    assert.equal(outsiderPayload.host, null);
    assert.ok(outsiderPayload.warnings.some((warning) => warning.code === "host_telemetry_restricted"));

    const malformed = await handleDashboardRequest(new Request("https://blackbox.test/api/session", { headers: { Cookie: "__Host-blackbox_session=%" } }), env);
    assert.equal(malformed?.status, 401);
    const crossOriginLogout = await handleDashboardRequest(new Request("https://blackbox.test/auth/logout", { method: "POST", headers: { Cookie: sessionCookie, Origin: "https://evil.test" } }), env);
    assert.equal(crossOriginLogout?.status, 403);
    const sameOriginLogout = await handleDashboardRequest(new Request("https://blackbox.test/auth/logout", { method: "POST", headers: { Cookie: sessionCookie, Origin: "https://blackbox.test" } }), env);
    assert.equal(sameOriginLogout?.status, 204);
    assert.match(sameOriginLogout?.headers.get("Set-Cookie") ?? "", /SameSite=Lax/);
  } finally {
    globalThis.fetch = originalFetch;
    sqlite.close();
  }
});
