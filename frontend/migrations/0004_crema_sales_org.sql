-- The CremaSales house org. This is the org we dog-food the marketing site
-- against: every form submission and pageview on /marketing(-ped|-jon) lands
-- as a real funnel_event scoped to org_id = 'org_cremasales'.
--
-- We use deterministic IDs (text PK + a stable tracking_guid) so the snippet
-- URL is /t/cremasales.js in every environment, and code can reference the
-- org by a known constant without a name-lookup round-trip.
--
-- Idempotent: INSERT OR IGNORE guards re-runs, the membership and CRM
-- back-fills are NULL-only updates that no-op on second application.

INSERT OR IGNORE INTO organizations (id, name, logo_url, tracking_guid, created_by)
VALUES ('org_cremasales', 'CremaSales', NULL, 'cremasales', NULL);

-- Every user currently in the database joins CremaSales. INSERT OR IGNORE
-- on the composite PK (org_id, user_id) means re-running this migration —
-- or adding new users later via the org-aware backfill in seed.ts — never
-- duplicates rows.
INSERT OR IGNORE INTO organization_members (org_id, user_id)
SELECT 'org_cremasales', id FROM users;

-- Back-fill org_id on every CRM row that pre-dates the multi-tenant cut.
-- The PRD demo hinges on judges seeing the seeded customers/tickets/leads
-- when they log in, *and* on those rows being visible in the same funnel
-- the marketing-site forms feed into. The WHERE org_id IS NULL guards
-- against re-tagging rows that already belong to another tenant.
UPDATE companies       SET org_id = 'org_cremasales' WHERE org_id IS NULL;
UPDATE contacts        SET org_id = 'org_cremasales' WHERE org_id IS NULL;
UPDATE leads           SET org_id = 'org_cremasales' WHERE org_id IS NULL;
UPDATE deals           SET org_id = 'org_cremasales' WHERE org_id IS NULL;
UPDATE activities      SET org_id = 'org_cremasales' WHERE org_id IS NULL;
UPDATE purchases       SET org_id = 'org_cremasales' WHERE org_id IS NULL;
UPDATE tickets         SET org_id = 'org_cremasales' WHERE org_id IS NULL;
UPDATE ticket_comments SET org_id = 'org_cremasales' WHERE org_id IS NULL;
UPDATE tasks           SET org_id = 'org_cremasales' WHERE org_id IS NULL;
