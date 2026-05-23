-- Organizations + memberships + invitations + funnel-event ingest.
-- Every authenticated user must belong to at least one organization to use the app.
-- Tracking snippets are keyed by organizations.tracking_guid (public).

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  tracking_guid TEXT NOT NULL UNIQUE,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_organizations_tracking_guid ON organizations(tracking_guid);

-- Membership is binary: you're in (admin of everything) or you're out.
CREATE TABLE organization_members (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX idx_organization_members_user ON organization_members(user_id);

-- Invitations identified by an opaque token (sent by email or pasted in app).
CREATE TABLE organization_invitations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked')),
  invited_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT,
  accepted_by TEXT REFERENCES users(id)
);
CREATE INDEX idx_invitations_token ON organization_invitations(token);
CREATE INDEX idx_invitations_org_status ON organization_invitations(org_id, status);
CREATE INDEX idx_invitations_email ON organization_invitations(email);

-- Beacon events from the tracking snippet (pageview / track / identify).
-- Kept separate from `activities` so anonymous traffic doesn't pollute the CRM
-- until an identify() call resolves an email to a contact.
CREATE TABLE funnel_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  anonymous_id TEXT NOT NULL,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  url TEXT,
  path TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  props_json TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_funnel_events_org_time ON funnel_events(org_id, occurred_at);
CREATE INDEX idx_funnel_events_anon ON funnel_events(org_id, anonymous_id);
CREATE INDEX idx_funnel_events_contact ON funnel_events(contact_id);
CREATE INDEX idx_funnel_events_event ON funnel_events(org_id, event_name);

-- Forward-compatibility: tag CRM rows with their owning org. Nullable for now
-- (SQLite ADD COLUMN can't be NOT NULL without a default), enforced in app code
-- when org-scoped server-fns insert new rows.
ALTER TABLE companies       ADD COLUMN org_id TEXT REFERENCES organizations(id);
ALTER TABLE contacts        ADD COLUMN org_id TEXT REFERENCES organizations(id);
ALTER TABLE leads           ADD COLUMN org_id TEXT REFERENCES organizations(id);
ALTER TABLE deals           ADD COLUMN org_id TEXT REFERENCES organizations(id);
ALTER TABLE activities      ADD COLUMN org_id TEXT REFERENCES organizations(id);
ALTER TABLE purchases       ADD COLUMN org_id TEXT REFERENCES organizations(id);
ALTER TABLE tickets         ADD COLUMN org_id TEXT REFERENCES organizations(id);
ALTER TABLE ticket_comments ADD COLUMN org_id TEXT REFERENCES organizations(id);
ALTER TABLE tasks           ADD COLUMN org_id TEXT REFERENCES organizations(id);

CREATE INDEX idx_companies_org   ON companies(org_id);
CREATE INDEX idx_contacts_org    ON contacts(org_id);
CREATE INDEX idx_deals_org       ON deals(org_id);
CREATE INDEX idx_activities_org  ON activities(org_id);
CREATE INDEX idx_tickets_org     ON tickets(org_id);
CREATE INDEX idx_tasks_org       ON tasks(org_id);
