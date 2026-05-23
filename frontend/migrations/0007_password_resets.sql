-- One-time password reset tokens. Hashed at rest so a DB leak doesn't grant
-- takeover (same shape as email_verification_tokens). Single-use (consumed_at),
-- 1h TTL (expires_at). Issuing a new reset for a user does NOT revoke prior
-- rows — the time-bound nature of expires_at + single-use consumed_at is
-- enough; users may legitimately have requested twice and clicked the older
-- link first.

CREATE TABLE password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  requested_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_password_resets_user ON password_resets(user_id);
