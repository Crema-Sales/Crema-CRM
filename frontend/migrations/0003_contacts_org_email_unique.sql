-- Make (org_id, email) unique on contacts so the funnel-event identify path
-- can use INSERT OR IGNORE without racing two concurrent posts into duplicate
-- rows. SQLite allows multiple NULL values in a unique index, so legacy rows
-- with a NULL org_id are unaffected.

CREATE UNIQUE INDEX IF NOT EXISTS contacts_org_email_unq ON contacts(org_id, email);
