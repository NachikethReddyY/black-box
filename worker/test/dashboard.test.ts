import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGitHubRun, parseLogLines } from "../src/dashboard";
import { parseHostTelemetry } from "../src/host";

test("normalizes a GitHub Actions run into dashboard data", () => {
  const run = normalizeGitHubRun({
    id: 42,
    name: "Checks",
    display_title: "AMR checks",
    event: "pull_request",
    status: "completed",
    conclusion: "success",
    created_at: "2026-09-29T07:00:00Z",
    updated_at: "2026-09-29T07:02:30Z",
    run_number: 18,
    run_attempt: 2,
    head_branch: "main",
    head_sha: "abc123",
    html_url: "https://github.com/acme/app/actions/runs/42",
  }, "acme/app");

  assert.deepEqual(run, {
    id: 42,
    name: "Checks",
    title: "AMR checks",
    repo: "acme/app",
    branch: "main",
    event: "pull_request",
    status: "completed",
    conclusion: "success",
    createdAt: "2026-09-29T07:00:00.000Z",
    updatedAt: "2026-09-29T07:02:30.000Z",
    durationSeconds: 150,
    runNumber: 18,
    attempt: 2,
    headSha: "abc123",
    htmlUrl: "https://github.com/acme/app/actions/runs/42",
  });
});

test("parses log lines into searchable levels without inventing detail", () => {
  assert.deepEqual(parseLogLines("INFO booted\nwarning: slow step\nERROR Connection refused\nplain output"), [
    { level: "INFO", message: "booted" },
    { level: "WARN", message: "warning: slow step" },
    { level: "ERROR", message: "Connection refused" },
    { level: "INFO", message: "plain output" },
  ]);
});

test("accepts bounded host telemetry and rejects impossible resource values", () => {
  const telemetry = parseHostTelemetry({
    host_id: "black-box-vbook",
    hostname: "VBook",
    runner_name: "black-box-vbook",
    cpu_percent: 18.5,
    memory_used_bytes: 6_400_000_000,
    memory_total_bytes: 16_000_000_000,
    disk_free_bytes: 750_000_000_000,
    disk_total_bytes: 1_000_000_000_000,
    wsl_memory_limit_bytes: 8_000_000_000,
    docker_ready: true,
  });
  assert.equal(telemetry?.dockerReady, true);
  assert.equal(parseHostTelemetry({ ...telemetry, memory_used_bytes: 20_000_000_000 }), null);
});
