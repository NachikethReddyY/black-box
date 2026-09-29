CREATE TABLE IF NOT EXISTS dashboard_sessions (
 session_id TEXT PRIMARY KEY,
 token_ciphertext TEXT NOT NULL,
 user_json TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dashboard_sessions_expiry_idx ON dashboard_sessions(expires_at);
