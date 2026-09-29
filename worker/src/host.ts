import { object } from "./github";
import type { WorkerEnv } from "./types";

export interface HostTelemetry {
  readonly hostId: string;
  readonly hostname: string;
  readonly runnerName: string;
  readonly cpuPercent: number;
  readonly memoryUsedBytes: number;
  readonly memoryTotalBytes: number;
  readonly diskFreeBytes: number;
  readonly diskTotalBytes: number;
  readonly wslMemoryLimitBytes: number | null;
  readonly dockerReady: boolean;
  readonly observedAt: string;
  readonly ageSeconds: number;
  readonly status: "online" | "stale";
}

interface HostRow {
  host_id: string;
  hostname: string;
  runner_name: string;
  cpu_percent: number;
  memory_used_bytes: number;
  memory_total_bytes: number;
  disk_free_bytes: number;
  disk_total_bytes: number;
  wsl_memory_limit_bytes: number | null;
  docker_ready: number;
  observed_at: number;
}

function boundedNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

export function parseHostTelemetry(value: unknown): Omit<HostTelemetry, "observedAt" | "ageSeconds" | "status"> | null {
  const row = object(value);
  if (!row || typeof row.host_id !== "string" || !/^[A-Za-z0-9_.:-]{1,80}$/.test(row.host_id) || typeof row.hostname !== "string" || row.hostname.length > 120 || typeof row.runner_name !== "string" || row.runner_name.length > 120) return null;
  const cpuPercent = boundedNumber(row.cpu_percent, 0, 100);
  const memoryUsedBytes = boundedNumber(row.memory_used_bytes, 0, Number.MAX_SAFE_INTEGER);
  const memoryTotalBytes = boundedNumber(row.memory_total_bytes, 1, Number.MAX_SAFE_INTEGER);
  const diskFreeBytes = boundedNumber(row.disk_free_bytes, 0, Number.MAX_SAFE_INTEGER);
  const diskTotalBytes = boundedNumber(row.disk_total_bytes, 1, Number.MAX_SAFE_INTEGER);
  const wslMemoryLimitBytes = row.wsl_memory_limit_bytes === null || row.wsl_memory_limit_bytes === undefined ? null : boundedNumber(row.wsl_memory_limit_bytes, 1, Number.MAX_SAFE_INTEGER);
  if (cpuPercent === null || memoryUsedBytes === null || memoryTotalBytes === null || diskFreeBytes === null || diskTotalBytes === null || memoryUsedBytes > memoryTotalBytes || diskFreeBytes > diskTotalBytes || (wslMemoryLimitBytes !== null && wslMemoryLimitBytes > memoryTotalBytes) || typeof row.docker_ready !== "boolean") return null;
  return { hostId: row.host_id, hostname: row.hostname, runnerName: row.runner_name, cpuPercent, memoryUsedBytes, memoryTotalBytes, diskFreeBytes, diskTotalBytes, wslMemoryLimitBytes, dockerReady: row.docker_ready };
}

function fromRow(row: HostRow, now: number): HostTelemetry {
  const ageSeconds = Math.max(0, Math.round((now - row.observed_at) / 1000));
  return { hostId: row.host_id, hostname: row.hostname, runnerName: row.runner_name, cpuPercent: row.cpu_percent, memoryUsedBytes: row.memory_used_bytes, memoryTotalBytes: row.memory_total_bytes, diskFreeBytes: row.disk_free_bytes, diskTotalBytes: row.disk_total_bytes, wslMemoryLimitBytes: row.wsl_memory_limit_bytes, dockerReady: row.docker_ready === 1, observedAt: new Date(row.observed_at).toISOString(), ageSeconds, status: ageSeconds <= 120 ? "online" : "stale" };
}

export async function latestHostTelemetry(db: D1Database, now = Date.now()): Promise<HostTelemetry | null> {
  const row = await db.prepare("SELECT * FROM host_telemetry ORDER BY observed_at DESC LIMIT 1").first<HostRow>();
  return row ? fromRow(row, now) : null;
}

export async function handleHostTelemetry(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  if (!env.HOST_AGENT_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.HOST_AGENT_TOKEN}`) return Response.json({ error: "not_found" }, { status: 404 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const telemetry = parseHostTelemetry(body);
  if (!telemetry) return Response.json({ error: "invalid_telemetry" }, { status: 400 });
  await env.DB.prepare("INSERT INTO host_telemetry (host_id,hostname,runner_name,cpu_percent,memory_used_bytes,memory_total_bytes,disk_free_bytes,disk_total_bytes,wsl_memory_limit_bytes,docker_ready,observed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(host_id) DO UPDATE SET hostname=excluded.hostname,runner_name=excluded.runner_name,cpu_percent=excluded.cpu_percent,memory_used_bytes=excluded.memory_used_bytes,memory_total_bytes=excluded.memory_total_bytes,disk_free_bytes=excluded.disk_free_bytes,disk_total_bytes=excluded.disk_total_bytes,wsl_memory_limit_bytes=excluded.wsl_memory_limit_bytes,docker_ready=excluded.docker_ready,observed_at=excluded.observed_at").bind(telemetry.hostId, telemetry.hostname, telemetry.runnerName, telemetry.cpuPercent, telemetry.memoryUsedBytes, telemetry.memoryTotalBytes, telemetry.diskFreeBytes, telemetry.diskTotalBytes, telemetry.wslMemoryLimitBytes, Number(telemetry.dockerReady), Date.now()).run();
  return Response.json({ status: "accepted" }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
