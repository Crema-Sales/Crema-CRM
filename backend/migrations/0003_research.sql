-- Phase 11: agentic OSINT prospect-research stack.
-- See AGENTS-AGENTS.md "Prospect research" section for the lifecycle.
--
-- Two tables: research_jobs (one row per run, terminal state captured in
-- `status` + `affinities_json` + `error`) and gift_drafts (one row per
-- ship-ready idea synthesized from a completed research job).

CREATE TABLE research_jobs (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  rep_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','running','complete','failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  hint TEXT,
  -- Serialized ProspectAffinities (zod schema in shared/schemas/research.ts).
  -- Stored as JSON in a TEXT column so the schema can evolve without an ALTER —
  -- the read path parses with the current zod and ignores forward-compat fields.
  affinities_json TEXT,
  error TEXT,
  steps INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_research_customer_started ON research_jobs(customer_id, started_at DESC);
CREATE INDEX idx_research_rep ON research_jobs(rep_id);
CREATE INDEX idx_research_status ON research_jobs(status);

CREATE TABLE gift_drafts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  rep_id TEXT NOT NULL,
  research_job_id TEXT REFERENCES research_jobs(id) ON DELETE SET NULL,
  idea TEXT NOT NULL,
  rationale TEXT NOT NULL,
  price_band TEXT NOT NULL CHECK (price_band IN ('$','$$','$$$')),
  suggested_vendor TEXT,
  draft_note TEXT NOT NULL,
  -- Serialized array of source URLs (each must back a personal/family claim).
  source_urls_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_gifts_customer_created ON gift_drafts(customer_id, created_at DESC);
CREATE INDEX idx_gifts_rep ON gift_drafts(rep_id);
