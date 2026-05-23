-- Per-org HMAC secret for auto-identify URLs. The tracking snippet
-- accepts `?crema_eid=<sig>.<emailB64>` and the public /api/public/identify
-- endpoint verifies HMAC-SHA256(emailB64, tracking_secret) before promoting
-- an anonymous visitor to a contact. Without the secret, anyone with a link
-- could pollute a customer's pipeline.
--
-- SQLite's ALTER TABLE ADD COLUMN does NOT allow a parenthesized expression
-- as a column default (only literal constants), so we add the column
-- nullable, backfill each existing row with a unique random value, and rely
-- on app code (createOrganization) to populate tracking_secret on new rows.

ALTER TABLE organizations ADD COLUMN tracking_secret TEXT;

UPDATE organizations
   SET tracking_secret = lower(hex(randomblob(16)))
 WHERE tracking_secret IS NULL OR tracking_secret = '';
