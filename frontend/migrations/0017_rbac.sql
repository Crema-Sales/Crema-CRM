-- Basic RBAC: a global super-admin flag, per-org member roles, DNS-TXT-verified
-- domain auto-join, reusable invite links with usage cap + expiry, and an audit
-- log of org membership changes.
--
-- The previous "every member is effectively admin" model (see comments in
-- src/auth/org-fns.ts and migrations/0002_orgs.sql) becomes a real three-tier
-- per-org role: `owner` (org creator, transferable), `admin` (can manage
-- members + settings), and `member` (default).

------------------------------------------------------------------
-- Global super-admin flag on users
------------------------------------------------------------------
-- A super-admin can see across all organizations and assign other super admins.
-- Bootstrap rule (enforced in app code, not here): the first ever signup gets
-- promoted to super_admin automatically. After that, only super admins can mint
-- new super admins.
ALTER TABLE users ADD COLUMN is_super_admin INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_users_super_admin ON users(is_super_admin) WHERE is_super_admin = 1;

------------------------------------------------------------------
-- Per-org role
------------------------------------------------------------------
-- Roles are scoped to (org_id, user_id), so a user can be `owner` of one org
-- and a `member` of another. The org's creator is bumped to `owner` below.
ALTER TABLE organization_members
  ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member'));

-- Backfill: anyone listed as `created_by` on their org becomes `owner` of it.
UPDATE organization_members
   SET role = 'owner'
 WHERE (org_id, user_id) IN (
   SELECT o.id, o.created_by
     FROM organizations o
    WHERE o.created_by IS NOT NULL
 );

CREATE INDEX idx_organization_members_role ON organization_members(org_id, role);

------------------------------------------------------------------
-- Domain auto-join
------------------------------------------------------------------
-- An org can claim a domain (e.g. "smashlabs.com"). After DNS verification
-- (TXT record at `_crema-verify.<domain>` containing the token), signups from
-- that email domain auto-join when `domain_join_enabled = 1`.
ALTER TABLE organizations ADD COLUMN email_domain         TEXT;
ALTER TABLE organizations ADD COLUMN domain_join_enabled  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN domain_verified_at   TEXT;
ALTER TABLE organizations ADD COLUMN domain_txt_token     TEXT;

CREATE INDEX idx_organizations_domain ON organizations(email_domain) WHERE email_domain IS NOT NULL;

------------------------------------------------------------------
-- Reusable invite links
------------------------------------------------------------------
-- Kept separate from organization_invitations (which is per-email and
-- single-use). A join link is a paste-anywhere URL; the creator picks how
-- many people can use it and when it expires.
CREATE TABLE organization_join_links (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  max_uses    INTEGER,                                         -- NULL = unlimited
  use_count   INTEGER NOT NULL DEFAULT 0,
  expires_at  TEXT,                                            -- NULL = never
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at  TEXT
);
CREATE INDEX idx_join_links_token  ON organization_join_links(token);
CREATE INDEX idx_join_links_org    ON organization_join_links(org_id, revoked_at);

------------------------------------------------------------------
-- Org audit log
------------------------------------------------------------------
-- Every membership-shaped change writes a row here. Surfaced in the
-- Settings → Members audit tab for org admins. Super-admin actions log here
-- too with the affected `org_id`.
CREATE TABLE org_audit_log (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id   TEXT REFERENCES users(id),                   -- NULL when system-initiated
  action          TEXT NOT NULL,                               -- e.g. 'member.invited', 'member.role_changed'
  target_user_id  TEXT REFERENCES users(id),                   -- subject of the action, if any
  details_json    TEXT,                                        -- JSON blob with action-specific fields
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_org_time ON org_audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_action   ON org_audit_log(action);

------------------------------------------------------------------
-- Super admin bootstrap
------------------------------------------------------------------
-- On a fresh install no users exist yet, so super-admin assignment falls
-- through to the first-signup-auto-promotion path in signUp() — whoever
-- stands up a fresh instance becomes the first super admin when they create
-- their account. Operators wanting to promote additional accounts can run
-- `UPDATE users SET is_super_admin = 1 WHERE email = '…';` against their
-- own D1 instance once those accounts exist.
