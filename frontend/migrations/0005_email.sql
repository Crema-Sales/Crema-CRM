-- Email verification + unsubscribe + send audit.
-- Verification is non-blocking: users sign up and use the app immediately.
-- Setting email_verified_at flips a UI badge; nothing 401s on it.
--
-- users.email          — the verified address (or signup address if never verified).
-- users.pending_email  — a new address awaiting verification. NULL when nothing pending.
-- users.email_verified_at always refers to users.email and is NEVER cleared on a
--   change-email request — the old verification persists until the new address
--   is confirmed (atomic promote in app code: pending_email -> email, stamp new
--   email_verified_at, clear pending_email).

ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN pending_email TEXT;

-- One-time verification tokens. Hashed so a DB leak doesn't grant takeover.
-- Single-use (consumed_at), 24h TTL (expires_at). On resend / change-email we
-- revoke prior pending rows for the same user_id so only the freshest link works.
-- token_hash uniqueness guarantees a hash collision (impossible in practice) or
-- a duplicate generation (also impossible — crypto.randomUUID + sha256) would
-- fail loudly rather than silently overwriting.
CREATE TABLE email_verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_email_verification_user ON email_verification_tokens(user_id);
CREATE INDEX idx_email_verification_email ON email_verification_tokens(email);

-- Unsubscribe preferences. Keyed by lowercased email (not user_id) because
-- ack emails go to contacts who may never have an account.
-- category lets us keep transactional sends going even after a marketing unsub:
--   'all'          — master switch; blocks every honor-unsubscribe send
--   'ack'          — tracker form-submit acknowledgments
--   'marketing'    — future marketing blasts
--   'notification' — operational notifications (TRANSACTIONAL — see client.ts)
-- 'verification' and 'notification' sends ignore this table entirely; legality
-- and product-soundness both require they always reach the user.
CREATE TABLE email_preferences (
  email TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('all', 'ack', 'marketing', 'notification')),
  unsubscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (email, category)
);
CREATE INDEX idx_email_preferences_email ON email_preferences(email);

-- One-time tokens minted alongside unsubscribe links in outbound emails. Phase
-- 04 inserts a row when it sends an ack; Phase 05's /unsubscribe/$token route
-- resolves the token here, then UPSERTs a real email_preferences row.
-- Decoupled from email_preferences so a stale/leaked token never reveals the
-- recipient's actual unsubscribe state.
CREATE TABLE email_unsubscribe_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('all', 'ack', 'marketing', 'notification')),
  org_id TEXT REFERENCES organizations(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  consumed_at TEXT
);
CREATE INDEX idx_email_unsub_tokens_email ON email_unsubscribe_tokens(email);

-- Audit log for every outbound send. Used by the 24h dedupe in the tracker
-- ack path (Phase 04) and for debugging "why didn't I get my email?".
CREATE TABLE email_sends (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('verification', 'ack', 'marketing', 'notification')),
  subject TEXT NOT NULL,
  resend_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped_unsubscribed')),
  error TEXT,
  org_id TEXT REFERENCES organizations(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_email_sends_to_category_time ON email_sends(to_email, category, created_at);
CREATE INDEX idx_email_sends_org ON email_sends(org_id);
