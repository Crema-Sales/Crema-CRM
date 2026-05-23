-- Site adapters: per-site selector maps for the copilot's browser tools.
--
-- Defaults live in backend/src/site-adapters.ts (versioned in git). This
-- table holds only discovery-mode overrides — what the agent writes after
-- reading a site's live DOM — merged on top of the default at read time.
--
-- Global, not per-rep: a corrected LinkedIn selector helps every rep.
-- `updated_by` records which rep's discovery run last wrote the row.

CREATE TABLE site_adapter_overrides (
  site TEXT PRIMARY KEY,
  adapter_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
