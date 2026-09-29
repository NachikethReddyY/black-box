CREATE TABLE IF NOT EXISTS host_telemetry (
 host_id TEXT PRIMARY KEY,
 hostname TEXT NOT NULL,
 runner_name TEXT NOT NULL,
 cpu_percent REAL NOT NULL,
 memory_used_bytes INTEGER NOT NULL,
 memory_total_bytes INTEGER NOT NULL,
 disk_free_bytes INTEGER NOT NULL,
 disk_total_bytes INTEGER NOT NULL,
 wsl_memory_limit_bytes INTEGER,
 docker_ready INTEGER NOT NULL,
 observed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS host_telemetry_observed_idx ON host_telemetry(observed_at);
