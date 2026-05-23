-- API keys for the public REST API (/api/v1/*). Each key belongs to a user
-- and is authenticated with `Authorization: Bearer crema_sk_…`. The CLI in
-- /cli and external AI agents use these to act with the minting user's
-- purview (their role + the org that was current when the key was created).
--
-- Only the SHA-256 hash of the key is stored — the plaintext is shown exactly
-- once at creation and is never recoverable. `key_prefix` keeps a short,
-- non-sensitive fragment ("crema_sk_a1b2c3") so the management UI can list
-- keys recognizably without holding the secret.

CREATE TABLE api_keys (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id        TEXT,
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,
  key_prefix    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at  TEXT,
  revoked_at    TEXT
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
