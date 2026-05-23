-- Phase 08: D1 persistence layer for the agentic backend.
-- Schema mirrors @crema/shared zod types one-to-one (camelCase fields → snake_case columns;
-- mapping back to camelCase happens in backend/src/db.ts).

CREATE TABLE sales_reps (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_sales_reps_active ON sales_reps(active);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company_id TEXT,
  assigned_to TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('prospect','active','dormant','churn_risk','churned')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_customers_assigned_to ON customers(assigned_to);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_email ON customers(email);

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('new','contacted','qualified','proposal','won','lost')),
  ltv_estimate REAL NOT NULL DEFAULT 0,
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_leads_customer ON leads(customer_id);
CREATE INDEX idx_leads_owner_stage ON leads(owner_id, stage);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('open','pending','closed')),
  priority TEXT NOT NULL CHECK (priority IN ('low','normal','high','urgent')),
  sla_breached INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX idx_tickets_customer ON tickets(customer_id);
CREATE INDEX idx_tickets_status ON tickets(status);

CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('note','email','call','page_view','ingest','agent_action')),
  body TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ui','agent','ingest')),
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_activities_customer_created ON activities(customer_id, created_at DESC);
CREATE INDEX idx_activities_actor ON activities(actor_id);
