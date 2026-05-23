// Org / membership / invitation primitives. Server-only.
import { getDB } from "@/db/env.server";
import { seedStageProbabilities } from "./stages.server";

export interface OrganizationRow {
  id: string;
  name: string;
  logo_url: string | null;
  tracking_guid: string;
  tracking_secret: string;
  created_by: string | null;
  created_at: string;
  sales_methodology: string;
  system_prompt: string | null;
}

export interface InvitationRow {
  id: string;
  org_id: string;
  email: string;
  token: string;
  status: "pending" | "accepted" | "revoked";
  invited_by: string | null;
  created_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
}

function uuid(): string {
  return crypto.randomUUID();
}

// Long random string we expose publicly as the per-org tracking key.
// GUID is fine — it's not a secret, just an identifier; rate-limit at the edge.
function trackingGuid(): string {
  return crypto.randomUUID();
}

// 16 bytes of randomness as lowercase hex — the per-org HMAC key for signed
// auto-identify URLs (see `docs/visitor-identification.md`). Generated in app
// code rather than as a DB column default because SQLite ALTER TABLE forbids
// parenthesized expression defaults.
function trackingSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

function inviteToken(): string {
  // 32 url-safe bytes; opaque, unguessable.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createOrganization(params: {
  name: string;
  createdBy: string;
  logoUrl?: string | null;
}): Promise<OrganizationRow> {
  const db = getDB();
  const id = uuid();
  const guid = trackingGuid();
  const secret = trackingSecret();
  await db
    .prepare(
      `INSERT INTO organizations (id, name, logo_url, tracking_guid, tracking_secret, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, params.name, params.logoUrl ?? null, guid, secret, params.createdBy)
    .run();
  await db
    .prepare(
      `INSERT INTO organization_members (org_id, user_id) VALUES (?, ?)`,
    )
    .bind(id, params.createdBy)
    .run();
  await seedStageProbabilities(id);
  const row = await getOrganization(id);
  if (!row) throw new Error("Failed to read back created organization");
  return row;
}

export async function getOrganization(id: string): Promise<OrganizationRow | null> {
  const db = getDB();
  return await db
    .prepare(
      `SELECT id, name, logo_url, tracking_guid, tracking_secret, created_by, created_at, sales_methodology, system_prompt
       FROM organizations WHERE id = ?`,
    )
    .bind(id)
    .first<OrganizationRow>();
}

export async function getOrganizationByGuid(guid: string): Promise<OrganizationRow | null> {
  const db = getDB();
  return await db
    .prepare(
      `SELECT id, name, logo_url, tracking_guid, tracking_secret, created_by, created_at, sales_methodology, system_prompt
       FROM organizations WHERE tracking_guid = ?`,
    )
    .bind(guid)
    .first<OrganizationRow>();
}

export async function updateOrganization(
  id: string,
  patch: {
    name?: string;
    logo_url?: string | null;
    sales_methodology?: string;
    system_prompt?: string | null;
  },
): Promise<OrganizationRow> {
  const db = getDB();
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    args.push(patch.name);
  }
  if (patch.logo_url !== undefined) {
    sets.push("logo_url = ?");
    args.push(patch.logo_url);
  }
  if (patch.sales_methodology !== undefined) {
    sets.push("sales_methodology = ?");
    args.push(patch.sales_methodology);
  }
  if (patch.system_prompt !== undefined) {
    sets.push("system_prompt = ?");
    args.push(patch.system_prompt);
  }
  if (sets.length === 0) {
    const row = await getOrganization(id);
    if (!row) throw new Error("Organization not found");
    return row;
  }
  args.push(id);
  await db
    .prepare(`UPDATE organizations SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...args)
    .run();
  const row = await getOrganization(id);
  if (!row) throw new Error("Organization not found");
  return row;
}

export async function listMyOrganizations(userId: string): Promise<OrganizationRow[]> {
  const db = getDB();
  const result = await db
    .prepare(
      `SELECT o.id, o.name, o.logo_url, o.tracking_guid, o.tracking_secret, o.created_by, o.created_at, o.sales_methodology, o.system_prompt
       FROM organizations o
       JOIN organization_members m ON m.org_id = o.id
       WHERE m.user_id = ?
       ORDER BY o.created_at ASC`,
    )
    .bind(userId)
    .all<OrganizationRow>();
  return result.results ?? [];
}

export interface OrgSummary {
  id: string;
  name: string;
  logo_url: string | null;
  member_count: number;
}

export async function listAllOrganizations(): Promise<OrgSummary[]> {
  const db = getDB();
  const result = await db
    .prepare(
      `SELECT o.id, o.name, o.logo_url,
              COUNT(m.user_id) AS member_count
       FROM organizations o
       LEFT JOIN organization_members m ON m.org_id = o.id
       GROUP BY o.id
       ORDER BY o.name ASC`,
    )
    .all<OrgSummary>();
  return result.results ?? [];
}

export interface UserWithOrgs {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  created_at: string;
  orgs: { id: string; name: string }[];
}

// Every user in the system, each with the orgs they belong to. Powers the
// all-users admin panel in Settings → Organization. The LEFT JOINs keep users
// with no membership in the result; we fold the flat rows into one entry per
// user. No RBAC — see listAllOrganizations.
export async function listAllUsers(): Promise<UserWithOrgs[]> {
  const db = getDB();
  const result = await db
    .prepare(
      `SELECT u.id AS user_id, u.email, u.full_name, u.role, u.created_at,
              o.id AS org_id, o.name AS org_name
       FROM users u
       LEFT JOIN organization_members m ON m.user_id = u.id
       LEFT JOIN organizations o ON o.id = m.org_id
       ORDER BY u.created_at ASC, o.name ASC`,
    )
    .all<{
      user_id: string;
      email: string;
      full_name: string | null;
      role: string;
      created_at: string;
      org_id: string | null;
      org_name: string | null;
    }>();
  const byUser = new Map<string, UserWithOrgs>();
  for (const r of result.results ?? []) {
    let user = byUser.get(r.user_id);
    if (!user) {
      user = {
        user_id: r.user_id,
        email: r.email,
        full_name: r.full_name,
        role: r.role,
        created_at: r.created_at,
        orgs: [],
      };
      byUser.set(r.user_id, user);
    }
    if (r.org_id && r.org_name) user.orgs.push({ id: r.org_id, name: r.org_name });
  }
  return [...byUser.values()];
}

// Make `orgId` the user's only organization: drop every existing membership,
// then add the one. Backs the all-users panel, where each user has a single
// org dropdown. INSERT OR IGNORE makes re-selecting the same org a no-op.
export async function setUserSoleOrg(userId: string, orgId: string): Promise<void> {
  const db = getDB();
  await db
    .prepare(`DELETE FROM organization_members WHERE user_id = ?`)
    .bind(userId)
    .run();
  await db
    .prepare(
      `INSERT OR IGNORE INTO organization_members (org_id, user_id) VALUES (?, ?)`,
    )
    .bind(orgId, userId)
    .run();
}

export async function addMember(orgId: string, userId: string): Promise<void> {
  const db = getDB();
  await db
    .prepare(
      `INSERT OR IGNORE INTO organization_members (org_id, user_id) VALUES (?, ?)`,
    )
    .bind(orgId, userId)
    .run();
}

export async function isMember(orgId: string, userId: string): Promise<boolean> {
  const db = getDB();
  const row = await db
    .prepare(
      `SELECT 1 AS one FROM organization_members WHERE org_id = ? AND user_id = ?`,
    )
    .bind(orgId, userId)
    .first<{ one: number }>();
  return !!row;
}

export type OrgRole = "owner" | "admin" | "member";
const ROLE_RANK: Record<OrgRole, number> = { member: 0, admin: 1, owner: 2 };

export interface MemberRow {
  user_id: string;
  email: string;
  full_name: string | null;
  role: OrgRole;
  is_super_admin: number;
  joined_at: string;
}

export async function listMembers(orgId: string): Promise<MemberRow[]> {
  const db = getDB();
  const result = await db
    .prepare(
      `SELECT u.id AS user_id, u.email, u.full_name, m.role, u.is_super_admin,
              m.created_at AS joined_at
       FROM organization_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.org_id = ?
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                m.created_at ASC`,
    )
    .bind(orgId)
    .all<MemberRow>();
  return result.results ?? [];
}

export async function getMemberRole(orgId: string, userId: string): Promise<OrgRole | null> {
  const db = getDB();
  const row = await db
    .prepare(
      `SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?`,
    )
    .bind(orgId, userId)
    .first<{ role: OrgRole }>();
  return row?.role ?? null;
}

// Throws if the caller is not a member of the org OR their role is below
// `minRole`. Returns the actual role on success so callers can branch on
// `owner` vs `admin` without a second lookup. Hierarchy: owner > admin > member.
export async function requireOrgRole(
  orgId: string,
  userId: string,
  minRole: OrgRole,
): Promise<OrgRole> {
  const role = await getMemberRole(orgId, userId);
  if (!role) throw new Error("You are not a member of that organization");
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new Error(`This action requires the ${minRole} role`);
  }
  return role;
}

export async function setMemberRole(
  orgId: string,
  userId: string,
  role: OrgRole,
): Promise<void> {
  const db = getDB();
  await db
    .prepare(
      `UPDATE organization_members SET role = ? WHERE org_id = ? AND user_id = ?`,
    )
    .bind(role, orgId, userId)
    .run();
}

export async function countOwners(orgId: string): Promise<number> {
  const db = getDB();
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM organization_members WHERE org_id = ? AND role = 'owner'`,
    )
    .bind(orgId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function logAuditEvent(params: {
  orgId: string;
  actorUserId: string | null;
  action: string;
  targetUserId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  const db = getDB();
  await db
    .prepare(
      `INSERT INTO org_audit_log (id, org_id, actor_user_id, action, target_user_id, details_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      params.orgId,
      params.actorUserId,
      params.action,
      params.targetUserId ?? null,
      params.details ? JSON.stringify(params.details) : null,
    )
    .run();
}

export interface AuditLogRow {
  id: string;
  org_id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  target_user_id: string | null;
  target_email: string | null;
  details_json: string | null;
  created_at: string;
}

export async function listAuditLog(orgId: string, limit = 100): Promise<AuditLogRow[]> {
  const db = getDB();
  const result = await db
    .prepare(
      `SELECT a.id, a.org_id, a.actor_user_id, ua.email AS actor_email,
              a.action, a.target_user_id, ut.email AS target_email,
              a.details_json, a.created_at
         FROM org_audit_log a
         LEFT JOIN users ua ON ua.id = a.actor_user_id
         LEFT JOIN users ut ON ut.id = a.target_user_id
        WHERE a.org_id = ?
        ORDER BY a.created_at DESC
        LIMIT ?`,
    )
    .bind(orgId, limit)
    .all<AuditLogRow>();
  return result.results ?? [];
}

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const db = getDB();
  const row = await db
    .prepare(`SELECT is_super_admin FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ is_super_admin: number }>();
  return row?.is_super_admin === 1;
}

export async function setSuperAdmin(userId: string, value: boolean): Promise<void> {
  const db = getDB();
  await db
    .prepare(`UPDATE users SET is_super_admin = ? WHERE id = ?`)
    .bind(value ? 1 : 0, userId)
    .run();
}

export async function countMembers(orgId: string): Promise<number> {
  const db = getDB();
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM organization_members WHERE org_id = ?`,
    )
    .bind(orgId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function removeMember(orgId: string, userId: string): Promise<void> {
  const db = getDB();
  await db
    .prepare(
      `DELETE FROM organization_members WHERE org_id = ? AND user_id = ?`,
    )
    .bind(orgId, userId)
    .run();
}

export async function createInvitation(params: {
  orgId: string;
  email: string;
  invitedBy: string;
}): Promise<InvitationRow> {
  const db = getDB();
  const email = params.email.toLowerCase().trim();
  // Reuse an existing pending invite for the same email instead of creating dupes.
  const existing = await db
    .prepare(
      `SELECT id, org_id, email, token, status, invited_by, created_at, accepted_at, accepted_by
       FROM organization_invitations
       WHERE org_id = ? AND email = ? AND status = 'pending'`,
    )
    .bind(params.orgId, email)
    .first<InvitationRow>();
  if (existing) return existing;
  const id = uuid();
  const token = inviteToken();
  await db
    .prepare(
      `INSERT INTO organization_invitations (id, org_id, email, token, invited_by)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, params.orgId, email, token, params.invitedBy)
    .run();
  const row = await db
    .prepare(
      `SELECT id, org_id, email, token, status, invited_by, created_at, accepted_at, accepted_by
       FROM organization_invitations WHERE id = ?`,
    )
    .bind(id)
    .first<InvitationRow>();
  if (!row) throw new Error("Failed to create invitation");
  return row;
}

export async function listPendingInvitations(orgId: string): Promise<InvitationRow[]> {
  const db = getDB();
  const result = await db
    .prepare(
      `SELECT id, org_id, email, token, status, invited_by, created_at, accepted_at, accepted_by
       FROM organization_invitations
       WHERE org_id = ? AND status = 'pending'
       ORDER BY created_at DESC`,
    )
    .bind(orgId)
    .all<InvitationRow>();
  return result.results ?? [];
}

export async function revokeInvitation(id: string, orgId: string): Promise<void> {
  const db = getDB();
  await db
    .prepare(
      `UPDATE organization_invitations
       SET status = 'revoked'
       WHERE id = ? AND org_id = ? AND status = 'pending'`,
    )
    .bind(id, orgId)
    .run();
}

export async function getInvitationByToken(token: string): Promise<InvitationRow | null> {
  const db = getDB();
  return await db
    .prepare(
      `SELECT id, org_id, email, token, status, invited_by, created_at, accepted_at, accepted_by
       FROM organization_invitations WHERE token = ?`,
    )
    .bind(token)
    .first<InvitationRow>();
}

export async function acceptInvitation(params: {
  token: string;
  userId: string;
  userEmail: string;
}): Promise<{ orgId: string }> {
  const db = getDB();
  const invite = await getInvitationByToken(params.token);
  if (!invite) throw new Error("Invitation not found");
  if (invite.status !== "pending") throw new Error("Invitation is no longer valid");
  // Allow accepting if the logged-in user's email matches the invited email
  // (case-insensitive). Lets people who signed up with a different casing still
  // accept; blocks an unrelated account from claiming someone else's invite.
  if (invite.email.toLowerCase() !== params.userEmail.toLowerCase()) {
    throw new Error("This invitation is for a different email address");
  }
  // Idempotent: if already a member, just mark the invite accepted.
  await db
    .prepare(
      `INSERT OR IGNORE INTO organization_members (org_id, user_id) VALUES (?, ?)`,
    )
    .bind(invite.org_id, params.userId)
    .run();
  await db
    .prepare(
      `UPDATE organization_invitations
       SET status = 'accepted', accepted_at = datetime('now'), accepted_by = ?
       WHERE id = ?`,
    )
    .bind(params.userId, invite.id)
    .run();
  return { orgId: invite.org_id };
}
