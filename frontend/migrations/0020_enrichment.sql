-- Agentic enrichment for companies and contacts.
--
-- When a company first gets a domain, or a contact first gets an email, an
-- LLM-driven enrichment pass populates logo/description/ticker/size for the
-- company and linkedin/bio for the contact. Triggered automatically on
-- insert/update by crm.functions.ts, and manually via a Refresh button.
--
-- `enrichment_status` is a state machine — pending → running → ok | error.
-- `last_enriched_at` is the wall-clock time of the most recent terminal
-- transition (ok or error); the UI uses it as "Last enriched <relative>".
-- `enrichment_enabled` on organizations is the per-org kill switch.
--
-- `organization_prompts` lets each org override the system prompts that
-- power AI features (daily summary, research, enrichment). The base
-- copilot SYSTEM_PROMPT stays in code — it encodes the safety/scope
-- contract — but every other prompt is editable here. App code reads
-- via getPromptForOrg(key, fallback) which falls back to the code default
-- when a row is absent.

ALTER TABLE companies ADD COLUMN website TEXT;
ALTER TABLE companies ADD COLUMN logo_url TEXT;
ALTER TABLE companies ADD COLUMN description TEXT;
ALTER TABLE companies ADD COLUMN ticker TEXT;
ALTER TABLE companies ADD COLUMN size_estimate TEXT;
ALTER TABLE companies ADD COLUMN last_enriched_at TEXT;
ALTER TABLE companies ADD COLUMN enrichment_status TEXT;
ALTER TABLE companies ADD COLUMN enrichment_error TEXT;

ALTER TABLE contacts ADD COLUMN linkedin_url TEXT;
ALTER TABLE contacts ADD COLUMN bio TEXT;
ALTER TABLE contacts ADD COLUMN last_enriched_at TEXT;
ALTER TABLE contacts ADD COLUMN enrichment_status TEXT;
ALTER TABLE contacts ADD COLUMN enrichment_error TEXT;

ALTER TABLE organizations ADD COLUMN enrichment_enabled INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS organization_prompts (
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prompt_key TEXT NOT NULL,
  body       TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT REFERENCES users(id),
  PRIMARY KEY (org_id, prompt_key)
);
