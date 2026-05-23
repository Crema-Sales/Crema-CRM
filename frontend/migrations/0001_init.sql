-- ctv-crm initial schema for Cloudflare D1 (SQLite).
-- Ports the Supabase Postgres schema with these changes:
--   * No RLS — auth/ownership enforced in app code (src/lib/crm.functions.ts).
--   * No SECURITY DEFINER helpers / triggers — logic in app code.
--   * UUID PKs replaced with TEXT (we generate via crypto.randomUUID()).
--   * TIMESTAMPTZ replaced with TEXT (ISO-8601). Defaults via app code where needed.
--   * Postgres enums replaced with TEXT + CHECK constraints.
--   * auth.users replaced with public.users (own auth — see src/auth/).

-- USERS (replaces supabase auth.users + profiles)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  title TEXT,
  role TEXT NOT NULL DEFAULT 'rep' CHECK (role IN ('admin', 'manager', 'rep')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_email ON users(email);

-- COMPANIES
CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  employee_count INTEGER,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_companies_domain ON companies(domain);

-- CONTACTS
CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  owner_id TEXT REFERENCES users(id),
  is_ideal_customer INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  relationship_stage TEXT NOT NULL DEFAULT 'lead'
    CHECK (relationship_stage IN ('lead', 'contact', 'deal', 'customer')),
  stage_entered_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_contacts_owner ON contacts(owner_id);
CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_contacts_stage ON contacts(relationship_stage);
CREATE INDEX idx_contacts_archived ON contacts(archived_at);
CREATE INDEX idx_contacts_email ON contacts(email);

-- LEADS
CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'qualified', 'disqualified', 'converted')),
  score INTEGER NOT NULL DEFAULT 0,
  estimated_ltv REAL NOT NULL DEFAULT 0,
  owner_id TEXT REFERENCES users(id),
  ai_reasoning TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- DEALS
CREATE TABLE deals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'discovery'
    CHECK (stage IN ('discovery', 'qualified', 'proposal', 'closing', 'won', 'lost')),
  value REAL NOT NULL DEFAULT 0,
  probability INTEGER NOT NULL DEFAULT 50,
  expected_close TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_deals_owner ON deals(owner_id);
CREATE INDEX idx_deals_stage ON deals(stage);

-- ACTIVITIES
CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL
    CHECK (type IN ('call', 'email', 'note', 'meeting', 'system', 'signal')),
  subject TEXT NOT NULL,
  body TEXT,
  contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id TEXT REFERENCES deals(id) ON DELETE CASCADE,
  owner_id TEXT REFERENCES users(id),
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_activities_contact ON activities(contact_id);
CREATE INDEX idx_activities_deal ON activities(deal_id);

-- PURCHASES
CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  product TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- TICKETS
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_to TEXT REFERENCES users(id),
  created_by TEXT REFERENCES users(id),
  sla_due_at TEXT,
  resolved_at TEXT,
  resolution_note TEXT,
  last_escalated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tickets_assigned ON tickets(assigned_to);
CREATE INDEX idx_tickets_status ON tickets(status);

-- TICKET COMMENTS
CREATE TABLE ticket_comments (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id),
  body TEXT NOT NULL,
  is_internal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ticket_comments_ticket ON ticket_comments(ticket_id, created_at);

-- TASKS
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_at TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  related_deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
  related_contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  related_ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  stage_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tasks_owner ON tasks(owner_id);
CREATE INDEX idx_tasks_contact_stage_key ON tasks(related_contact_id, stage_key);

-- KEY ACTIONS (signal patterns)
CREATE TABLE key_actions (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  match_subject TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed key actions (parity with original schema)
INSERT INTO key_actions (id, label, match_subject, weight) VALUES
  ('ka_pricing',     'Viewed pricing',                 'pricing',     15),
  ('ka_demo',        'Requested demo',                 'demo',        25),
  ('ka_proposal',    'Opened proposal',                'proposal',    20),
  ('ka_stakeholder', 'Multiple stakeholders engaged',  'stakeholder', 30);
