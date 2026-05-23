-- Relationships: top-level wrapper aggregating contacts, companies, and deals
-- into a single sales-funnel container. Funnel status lives here; deals retain
-- their own internal kanban stage (discovery -> won/lost) for pipeline tracking.
--
-- Cardinality:
--   relationship <-> contacts   : M:N  (relationship_contacts join table)
--   relationship <-> companies  : M:N  (relationship_companies join table; usually 1)
--   relationship <-> deals      : 1:N  (deals.relationship_id FK)
--
-- The status enum has no CHECK constraint yet — taxonomy is pending.
-- A follow-up migration will add the CHECK once the vocabulary is finalized.

-- RELATIONSHIPS
CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id),
  name TEXT,
  status TEXT NOT NULL DEFAULT 'prospecting',
  status_entered_at TEXT NOT NULL DEFAULT (datetime('now')),
  owner_id TEXT REFERENCES users(id),
  notes TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_relationships_org ON relationships(org_id);
CREATE INDEX idx_relationships_owner ON relationships(owner_id);
CREATE INDEX idx_relationships_status ON relationships(status);
CREATE INDEX idx_relationships_archived ON relationships(archived_at);

-- RELATIONSHIP <-> CONTACTS (M:N)
-- `role` captures the contact's function in this relationship (champion,
-- decision-maker, blocker, end-user, etc.). Free-text for now — taxonomy TBD.
-- At most one row per relationship may have is_primary = 1 (enforced via
-- partial unique index below).
CREATE TABLE relationship_contacts (
  relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  org_id TEXT REFERENCES organizations(id),
  role TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (relationship_id, contact_id)
);
CREATE INDEX idx_rel_contacts_contact ON relationship_contacts(contact_id);
CREATE INDEX idx_rel_contacts_org ON relationship_contacts(org_id);
CREATE UNIQUE INDEX idx_rel_contacts_one_primary
  ON relationship_contacts(relationship_id)
  WHERE is_primary = 1;

-- RELATIONSHIP <-> COMPANIES (M:N — usually 1, occasionally more)
CREATE TABLE relationship_companies (
  relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  org_id TEXT REFERENCES organizations(id),
  role TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (relationship_id, company_id)
);
CREATE INDEX idx_rel_companies_company ON relationship_companies(company_id);
CREATE INDEX idx_rel_companies_org ON relationship_companies(org_id);
CREATE UNIQUE INDEX idx_rel_companies_one_primary
  ON relationship_companies(relationship_id)
  WHERE is_primary = 1;

-- DEALS gain relationship_id (M:1). Nullable for backfill; app code should
-- require it on new deal creation once relationships are live.
ALTER TABLE deals ADD COLUMN relationship_id TEXT REFERENCES relationships(id);
CREATE INDEX idx_deals_relationship ON deals(relationship_id);
