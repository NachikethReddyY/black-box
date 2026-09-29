CREATE TABLE IF NOT EXISTS requests (
 request_id TEXT PRIMARY KEY,
 event_id TEXT NOT NULL UNIQUE,
 repository TEXT NOT NULL,
 actor TEXT NOT NULL,
 source_event TEXT NOT NULL CHECK(source_event IN ('pull_request','push','schedule','manual')),
 workflow_file TEXT NOT NULL,
 workflow_ref TEXT NOT NULL,
 source_ref TEXT NOT NULL,
 pr_number TEXT NOT NULL,
 commit_sha TEXT NOT NULL,
 head_sha TEXT NOT NULL,
 base_sha TEXT NOT NULL,
 merge_ready INTEGER NOT NULL,
 runner TEXT NOT NULL CHECK(runner IN ('home','github','blacksmith','waiting')),
 state TEXT NOT NULL CHECK(state IN ('pending','claimed','dispatched','ambiguous','completed','superseded')),
 attempt_count INTEGER NOT NULL DEFAULT 0,
 workflow_run_id INTEGER,
 workflow_run_attempt INTEGER,
 checks_json TEXT NOT NULL DEFAULT '{}',
 conclusion TEXT,
 last_error TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS requests_due_idx ON requests(state, next_attempt_at);
CREATE INDEX IF NOT EXISTS requests_run_idx ON requests(workflow_run_id);
CREATE INDEX IF NOT EXISTS requests_pr_idx ON requests(repository, pr_number, head_sha);
CREATE INDEX IF NOT EXISTS requests_retention_idx ON requests(state, updated_at);
