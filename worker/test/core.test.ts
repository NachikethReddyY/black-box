import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";
import { createPrivateKey, webcrypto } from "node:crypto";
import { configFromEnv, selectRunner } from "../src/config";
import { createAppJwt } from "../src/auth";
import { verifyGitHubSignature, githubSignatureForTests } from "../src/signature";
import { runnerHasRequiredLabels, workflowDispatchInput } from "../src/github";
import { manualRequest } from "../src/manual";
import type { RequestRecord, WorkerEnv } from "../src/types";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const env = (extra: Partial<WorkerEnv> = {}): WorkerEnv => ({
  DB: {} as D1Database, WEBHOOK_SECRET: "secret", TRUSTED_REPOSITORIES: "acme/project", TRUSTED_ACTORS: "octocat",
  GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: "unused", GITHUB_APP_INSTALLATION_ID: "2", ...extra,
});

test("verifies raw GitHub HMAC signatures and rejects mutations", async () => {
  const body = '{"ok":true}';
  const signature = await githubSignatureForTests(body, "secret");
  assert.equal(await verifyGitHubSignature(body, signature, "secret"), true);
  assert.equal(await verifyGitHubSignature(`${body} `, signature, "secret"), false);
  assert.equal(await verifyGitHubSignature(body, "sha256=bad", "secret"), false);
});

test("defaults to free home/waiting runners and never selects a paid fallback unless enabled", () => {
  const safe = configFromEnv(env());
  assert.deepEqual(safe.runnerOrder, ["home", "waiting"]);
  assert.equal(selectRunner(safe, new Set(["waiting"])), "waiting");
  const paid = configFromEnv(env({ DISPATCH_RUNNERS: "home,github,waiting", ENABLE_PAID_FALLBACKS: "true" }));
  assert.equal(selectRunner(paid, new Set(["github", "waiting"])), "github");
});

test("workflow input preserves exact revision and correlation fields", () => {
  const config = configFromEnv(env({ DISPATCH_RUNNERS: "home" }));
  const request = {
    requestId: "123e4567-e89b-12d3-a456-426614174000",
    sourceEvent: "pull_request", workflowFile: "black-box-ci.yml", workflowRef: "main", mergeReady: true, checks: {}, expiresAt: 9999999999999,
    eventId: "delivery-1", repository: "acme/project", actor: "octocat", sourceRef: "refs/heads/feature",
    prNumber: "7", commitSha: "a".repeat(40), headSha: "a".repeat(40), baseSha: "b".repeat(40), runner: "home",
    state: "pending", attemptCount: 0, nextAttemptAt: 0, createdAt: 0, updatedAt: 0,
  } satisfies RequestRecord;
  assert.deepEqual(workflowDispatchInput(config, request).inputs, {
    runner: "home", commit_sha: "a".repeat(40), head_sha: "a".repeat(40), request_id: request.requestId,
    source_ref: "refs/heads/feature", pr_number: "7", source_event: "pull_request",
  });
});

test("runner label matching accepts GitHub's canonical label casing", () => {
  assert.equal(runnerHasRequiredLabels(["self-hosted", "Linux", "X64", "black-box-linux"], "black-box-linux"), true);
  assert.equal(runnerHasRequiredLabels(["self-hosted", "Linux", "X64"], "black-box-linux"), false);
});

test("App JWT uses RS256 and expected claims", async () => {
  const keyPair = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pkcs8 = await webcrypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  let binary = ""; for (const byte of new Uint8Array(pkcs8)) binary += String.fromCharCode(byte);
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----`;
  const jwt = await createAppJwt({ GITHUB_APP_ID: "42", GITHUB_APP_PRIVATE_KEY: pem }, 1_700_000_000);
  const [header, payload, signature] = jwt.split(".");
  assert.equal(JSON.parse(atob(header.replace(/-/g, "+").replace(/_/g, "/"))).alg, "RS256");
  assert.equal(JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).iss, "42");
  assert.ok(signature.length > 0);
});

test("App JWT accepts GitHub's native PKCS#1 private key format", async () => {
  const keyPair = await webcrypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pkcs8 = await webcrypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const pem = createPrivateKey({ key: Buffer.from(pkcs8), format: "der", type: "pkcs8" }).export({ format: "pem", type: "pkcs1" }).toString();
  assert.match(pem, /BEGIN RSA PRIVATE KEY/);
  const jwt = await createAppJwt({ GITHUB_APP_ID: "42", GITHUB_APP_PRIVATE_KEY: pem }, 1_700_000_000);
  const [header, payload, signature] = jwt.split(".");
  const valid = await webcrypto.subtle.verify("RSASSA-PKCS1-v1_5", keyPair.publicKey, Buffer.from(signature, "base64url"), new TextEncoder().encode(`${header}.${payload}`));
  assert.equal(valid, true);
});

test("repository allowlist and event dedupe are durable contracts", async () => {
  const config = configFromEnv(env());
  assert.equal(config.trustedRepositories.has("acme/project"), true);
  assert.equal(config.trustedRepositories.has("attacker/fork"), false);
  const migration = await import("node:fs/promises");
  const sql = await migration.readFile(new URL("../migrations/0001_dispatch.sql", import.meta.url), "utf8");
  assert.match(sql, /event_id TEXT NOT NULL UNIQUE/);
});

test("manual requests accept exact revisions and reject workflow changes", () => {
  const config = configFromEnv(env({ GITHUB_WORKFLOW_FILE: "black-box-ci.yml" }));
  const request = manualRequest({
    repository: "acme/project",
    source_ref: "refs/heads/main",
    commit_sha: "A".repeat(40),
    idempotency_key: "agent-1",
  }, config, "operator", "123e4567-e89b-12d3-a456-426614174000", 1);
  assert.equal(request.sourceEvent, "manual");
  assert.equal(request.commitSha, "a".repeat(40));
  assert.equal(request.headSha, request.commitSha);
  assert.equal(request.eventId, "manual:acme/project:agent-1");
  assert.throws(() => manualRequest({ ...request, workflow_file: "other.yml" }, config, "operator", crypto.randomUUID(), 1), /workflow_not_allowed/);
  assert.throws(() => manualRequest({ ...request, repository: "outsider/fork" }, config, "operator", crypto.randomUUID(), 1), /repository_not_allowed/);
});
