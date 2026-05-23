-- Lock the relationship status taxonomy with a CHECK constraint.
-- Six states: new, stale (off-funnel, 0 cups), lead (1 cup), discovery (2 cups),
-- budget_confirmed (3 cups), customer (post-funnel).
-- Deal-stage cups (4-8) live on the deals table and are derived in app code.
--
-- SQLite can't alter CHECK constraints, so we rebuild the table. The
-- relationships table is empty post-0007, so this is a no-op data-wise.

CREATE TABLE relationships_new (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id),
  name TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'stale', 'lead', 'discovery', 'budget_confirmed', 'customer')),
  status_entered_at TEXT NOT NULL DEFAULT (datetime('now')),
  owner_id TEXT REFERENCES users(id),
  notes TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO relationships_new
  SELECT id, org_id, name, status, status_entered_at, owner_id, notes, archived_at, created_at
  FROM relationships;

DROP TABLE relationships;
ALTER TABLE relationships_new RENAME TO relationships;

CREATE INDEX idx_relationships_org ON relationships(org_id);
CREATE INDEX idx_relationships_owner ON relationships(owner_id);
CREATE INDEX idx_relationships_status ON relationships(status);
CREATE INDEX idx_relationships_archived ON relationships(archived_at);
