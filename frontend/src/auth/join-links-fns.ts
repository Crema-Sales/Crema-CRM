// Reusable paste-anywhere org invite links. Separate from the email-bound
// `organization_invitations` table (one row per recipient): a join link is
// org-scoped, may be used by multiple people, and ships its own cap +
// expiry. See migration 0017 for the schema.

import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { signJwt } from "./crypto";
import { authPayloadFromCookieHeader, buildAuthCookie } from "./cookies.server";
import { getDB, getEnv } from "@/db/env.server";
import {
  addMember,
  getOrganization,
  isMember,
  logAuditEvent,
  requireOrgRole,
} from "@/lib/orgs.server";

const SESSION_TTL_SEC = 60 * 60 * 24 * 7;

function uuid(): string {
  return crypto.randomUUID();
}

// Opaque, unguessable. 30 bytes → 40 url-safe chars.
function mintLinkToken(): string {
  const bytes = new Uint8Array(30);
  crypto.getRandomValues(bytes);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function requireSession() {
  const req = getRequest();
  const payload = await authPayloadFromCookieHeader(req?.headers?.get("cookie"));
  if (!payload) {
    setResponseStatus(401);
    throw new Error("Unauthorized");
  }
  return payload;
}

export interface JoinLinkRow {
  id: string;
  org_id: string;
  token: string;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
}

const CreateInput = z.object({
  org_id: z.string().min(1),
  max_uses: z.number().int().min(1).max(10_000).nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
});

export const createOrgJoinLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await requireOrgRole(data.org_id, session.sub, "admin");
    const id = uuid();
    const token = mintLinkToken();
    const db = getDB();
    await db
      .prepare(
        `INSERT INTO organization_join_links
           (id, org_id, token, max_uses, expires_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        data.org_id,
        token,
        data.max_uses ?? null,
        data.expires_at ?? null,
        session.sub,
      )
      .run();
    await logAuditEvent({
      orgId: data.org_id,
      actorUserId: session.sub,
      action: "join_link.created",
      details: {
        link_id: id,
        max_uses: data.max_uses ?? null,
        expires_at: data.expires_at ?? null,
      },
    });
    const row = await db
      .prepare(
        `SELECT id, org_id, token, max_uses, use_count, expires_at, created_by, created_at, revoked_at
           FROM organization_join_links WHERE id = ?`,
      )
      .bind(id)
      .first<JoinLinkRow>();
    if (!row) throw new Error("Failed to create join link");
    return row;
  });

const RevokeInput = z.object({
  org_id: z.string().min(1),
  link_id: z.string().min(1),
});

export const revokeOrgJoinLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RevokeInput.parse(d))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await requireOrgRole(data.org_id, session.sub, "admin");
    const db = getDB();
    await db
      .prepare(
        `UPDATE organization_join_links
            SET revoked_at = datetime('now')
          WHERE id = ? AND org_id = ? AND revoked_at IS NULL`,
      )
      .bind(data.link_id, data.org_id)
      .run();
    await logAuditEvent({
      orgId: data.org_id,
      actorUserId: session.sub,
      action: "join_link.revoked",
      details: { link_id: data.link_id },
    });
    return { ok: true };
  });

const ListInput = z.object({ org_id: z.string().min(1) });

export const listOrgJoinLinks = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await requireOrgRole(data.org_id, session.sub, "admin");
    const db = getDB();
    const result = await db
      .prepare(
        `SELECT id, org_id, token, max_uses, use_count, expires_at, created_by, created_at, revoked_at
           FROM organization_join_links
          WHERE org_id = ?
          ORDER BY created_at DESC`,
      )
      .bind(data.org_id)
      .all<JoinLinkRow>();
    return result.results ?? [];
  });

// Three failure shapes:
//   - 'not_found' — token doesn't exist
//   - 'revoked'   — admin pulled the link
//   - 'expired'   — past expires_at
//   - 'exhausted' — use_count >= max_uses
// All collapsed into ok:false so the marketing-page preview UI doesn't have
// to enumerate them.
const PreviewInput = z.object({ token: z.string().min(1).max(200) });

export const previewJoinLink = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => PreviewInput.parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    const link = await db
      .prepare(
        `SELECT id, org_id, max_uses, use_count, expires_at, revoked_at
           FROM organization_join_links WHERE token = ?`,
      )
      .bind(data.token)
      .first<{
        id: string;
        org_id: string;
        max_uses: number | null;
        use_count: number;
        expires_at: string | null;
        revoked_at: string | null;
      }>();
    if (!link) return { ok: false as const, reason: "not_found" as const };
    if (link.revoked_at) return { ok: false as const, reason: "revoked" as const };
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      return { ok: false as const, reason: "expired" as const };
    }
    if (link.max_uses !== null && link.use_count >= link.max_uses) {
      return { ok: false as const, reason: "exhausted" as const };
    }
    const org = await getOrganization(link.org_id);
    if (!org) return { ok: false as const, reason: "not_found" as const };
    return {
      ok: true as const,
      org: { id: org.id, name: org.name, logo_url: org.logo_url },
      uses_remaining:
        link.max_uses === null ? null : link.max_uses - link.use_count,
      expires_at: link.expires_at,
    };
  });

const ConsumeInput = z.object({ token: z.string().min(1).max(200) });

// Authenticated. The caller must already have an account — the marketing /
// invite page sends them through /login first if they don't. Atomic
// use_count increment via the `WHERE` clause guards against the link
// expiring under a concurrent claim.
export const consumeJoinLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ConsumeInput.parse(d))
  .handler(async ({ data }) => {
    const session = await requireSession();
    const db = getDB();
    const link = await db
      .prepare(
        `SELECT id, org_id, max_uses, use_count, expires_at, revoked_at
           FROM organization_join_links WHERE token = ?`,
      )
      .bind(data.token)
      .first<{
        id: string;
        org_id: string;
        max_uses: number | null;
        use_count: number;
        expires_at: string | null;
        revoked_at: string | null;
      }>();
    if (!link) throw new Error("That invite link is invalid");
    if (link.revoked_at) throw new Error("That invite link has been revoked");
    if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
      throw new Error("That invite link has expired");
    }
    // Idempotent: if the caller is already a member, just refresh their
    // cookie and return. Don't burn a use_count slot.
    if (await isMember(link.org_id, session.sub)) {
      await refreshCookieToOrg(session, link.org_id);
      return { ok: true, org_id: link.org_id, already_member: true };
    }
    // Atomic claim. The `use_count < max_uses` guard in the WHERE clause
    // means two concurrent consumers can't both squeeze through after the
    // final slot. SQLite returns `changes()` as the number of rows updated.
    const claimed = await db
      .prepare(
        `UPDATE organization_join_links
            SET use_count = use_count + 1
          WHERE id = ?
            AND revoked_at IS NULL
            AND (max_uses IS NULL OR use_count < max_uses)
            AND (expires_at IS NULL OR expires_at > datetime('now'))`,
      )
      .bind(link.id)
      .run();
    if (!claimed.meta?.changes || claimed.meta.changes === 0) {
      throw new Error("That invite link is no longer accepting new members");
    }
    await addMember(link.org_id, session.sub);
    await logAuditEvent({
      orgId: link.org_id,
      actorUserId: session.sub,
      action: "member.joined_via_link",
      targetUserId: session.sub,
      details: { link_id: link.id },
    });
    await refreshCookieToOrg(session, link.org_id);
    return { ok: true, org_id: link.org_id, already_member: false };
  });

// Small JWT-rebake helper duplicated from org-fns to keep this file
// self-contained — same shape, no functional difference.
async function refreshCookieToOrg(
  payload: {
    sub: string;
    email: string;
    role: "admin" | "manager" | "rep";
    coach_persona_slug?: string | null;
    user_system_prompt?: string | null;
    is_super_admin?: boolean;
  },
  orgId: string,
): Promise<void> {
  const env = getEnv();
  const org = await getOrganization(orgId);
  const token = await signJwt(
    {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      current_org_id: orgId,
      coach_persona_slug: payload.coach_persona_slug ?? null,
      org_system_prompt: org?.system_prompt ?? null,
      user_system_prompt: payload.user_system_prompt ?? null,
      is_super_admin: payload.is_super_admin === true ? true : undefined,
    },
    env.JWT_SECRET,
    SESSION_TTL_SEC,
  );
  setResponseHeader("set-cookie", buildAuthCookie(token, SESSION_TTL_SEC));
}
