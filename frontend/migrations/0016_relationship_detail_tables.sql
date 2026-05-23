-- Add relationship_deals junction table and relationship_notes for the
-- relationship detail page. Also retrofits relationship_contacts and
-- relationship_companies with a UUID id column (app code uses INSERT with id).

-- Rebuild relationship_contacts with an id PK column
CREATE TABLE relationship_contacts_new (
  id              TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  contact_id      TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  org_id          TEXT REFERENCES organizations(id),
  role            TEXT NOT NULL DEFAULT 'primary',
  is_primary      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(relationship_id, contact_id)
);
INSERT INTO relationship_contacts_new (id, relationship_id, contact_id, org_id, role, is_primary, created_at)
  SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
         relationship_id, contact_id, org_id, COALESCE(role, 'primary'), is_primary, created_at
  FROM relationship_contacts;
DROP TABLE relationship_contacts;
ALTER TABLE relationship_contacts_new RENAME TO relationship_contacts;
CREATE INDEX idx_rel_contacts_contact ON relationship_contacts(contact_id);
CREATE INDEX idx_rel_contacts_org     ON relationship_contacts(org_id);

-- Rebuild relationship_companies with an id PK column
CREATE TABLE relationship_companies_new (
  id              TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  org_id          TEXT REFERENCES organizations(id),
  role            TEXT NOT NULL DEFAULT 'primary',
  is_primary      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(relationship_id, company_id)
);
INSERT INTO relationship_companies_new (id, relationship_id, company_id, org_id, role, is_primary, created_at)
  SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
         relationship_id, company_id, org_id, COALESCE(role, 'primary'), is_primary, created_at
  FROM relationship_companies;
DROP TABLE relationship_companies;
ALTER TABLE relationship_companies_new RENAME TO relationship_companies;
CREATE INDEX idx_rel_companies_company ON relationship_companies(company_id);
CREATE INDEX idx_rel_companies_org     ON relationship_companies(org_id);

-- Relationship <-> Deals junction (M:N)
CREATE TABLE relationship_deals (
  id              TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  deal_id         TEXT NOT NULL REFERENCES deals(id)         ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'primary',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(relationship_id, deal_id)
);
CREATE INDEX idx_rel_deals_rel  ON relationship_deals(relationship_id);
CREATE INDEX idx_rel_deals_deal ON relationship_deals(deal_id);

-- Relationship notes
CREATE TABLE relationship_notes (
  id              TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES relationships(id) ON DELETE CASCADE,
  title           TEXT,
  body            TEXT NOT NULL,
  pinned          INTEGER NOT NULL DEFAULT 0,
  owner_id        TEXT REFERENCES users(id),
  org_id          TEXT REFERENCES organizations(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_rel_notes_rel ON relationship_notes(relationship_id);
CREATE INDEX idx_rel_notes_org ON relationship_notes(org_id);
