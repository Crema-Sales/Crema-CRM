-- Per-rep quotas (versioned) + deals.closed_at for attainment math.
--
-- Versioning lives in `user_quotas` so a quota raise mid-period preserves
-- the prior row for historical "what was Jon's Q1 number" lookups. The
-- active row for a user is the one where date('now') falls in
-- [effective_from, effective_to). Edits are insert-new + close-prior, not
-- in-place UPDATEs.
--
-- deals.closed_at is the actual close timestamp (set in app code when a
-- deal flips to stage='won', cleared when reverted). `expected_close`
-- stays as the forecast date — it drives weighted-pipeline windowing but
-- never counts as realized attainment.

CREATE TABLE user_quotas (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount >= 0),
  period_type TEXT NOT NULL
    CHECK (period_type IN ('monthly', 'quarterly')),
  effective_from TEXT NOT NULL DEFAULT (date('now')),
  effective_to TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_user_quotas_active
  ON user_quotas(org_id, user_id, effective_from);

ALTER TABLE deals ADD COLUMN closed_at TEXT;
CREATE INDEX idx_deals_owner_closed
  ON deals(org_id, owner_id, closed_at);

-- Backfill closed_at for existing won deals so they count toward the
-- period they were already in. expected_close is the forecast; fall back
-- to created_at when it's null.
UPDATE deals
   SET closed_at = COALESCE(expected_close, created_at)
 WHERE stage = 'won' AND closed_at IS NULL;
