// Server-fns the React app calls to manage org membership state.
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { signJwt } from "./crypto";
import {
  authPayloadFromCookieHeader,
  buildAuthCookie,
} from "./cookies.server";
import { getDB, getEnv } from "@/db/env.server";
import {
  acceptInvitation,
  addMember,
  countOwners,
  createInvitation,
  createOrganization,
  getInvitationByToken,
  getMemberRole,
  getOrganization,
  isMember,
  isSuperAdmin,
  listAllOrganizations,
  listAllUsers,
  listAuditLog,
  listMembers,
  listMyOrganizations,
  listPendingInvitations,
  logAuditEvent,
  type OrgRole,
  removeMember,
  requireOrgRole,
  revokeInvitation,
  setMemberRole,
  setSuperAdmin,
  setUserSoleOrg,
  updateOrganization,
} from "@/lib/orgs.server";
import {
  listStageProbabilities,
  setStageProbability,
} from "@/lib/stages.server";
import { DEAL_STAGES, type DealStage } from "@/lib/stages";
import { signCremaEid } from "@/lib/tracking-signature";

const SESSION_TTL_SEC = 60 * 60 * 24 * 7;

async function requireSession() {
  const req = getRequest();
  const payload = await authPayloadFromCookieHeader(req?.headers?.get("cookie"));
  if (!payload) {
    setResponseStatus(401);
    throw new Error("Unauthorized");
  }
  return payload;
}

// Super-admin gate. Reads is_super_admin from the JWT but re-checks the DB
// because the JWT can be up to 7 days stale (the TTL). Defense in depth for
// any read or mutation that gives cross-org visibility.
async function requireSuperAdmin(userId: string): Promise<void> {
  if (!(await isSuperAdmin(userId))) {
    throw new Error("This action requires super-admin privileges");
  }
}

async function refreshCookieWithOrg(payload: {
  sub: string;
  email: string;
  role: "admin" | "manager" | "rep";
  coach_persona_slug?: string | null;
  user_system_prompt?: string | null;
  is_super_admin?: boolean;
}, orgId: string | undefined) {
  const env = getEnv();
  // The org's system prompt rides on the JWT alongside the user's so the
  // backend agent doesn't have to make a cross-Worker DB call per chat turn.
  // Stale-after-write across other org members is acceptable for v1 — their
  // JWTs refresh on next sign-in or session rebake (≤7d).
  const orgSystemPrompt = orgId ? await readOrgSystemPrompt(orgId) : null;
  const token = await signJwt(
    {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      current_org_id: orgId,
      coach_persona_slug: payload.coach_persona_slug ?? null,
      org_system_prompt: orgSystemPrompt,
      user_system_prompt: payload.user_system_prompt ?? null,
      is_super_admin: payload.is_super_admin === true ? true : undefined,
    },
    env.JWT_SECRET,
    SESSION_TTL_SEC,
  );
  setResponseHeader("set-cookie", buildAuthCookie(token, SESSION_TTL_SEC));
}

async function readOrgSystemPrompt(orgId: string): Promise<string | null> {
  const org = await getOrganization(orgId);
  return org?.system_prompt ?? null;
}

export const listMyOrgs = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  const orgs = await listMyOrganizations(session.sub);
  // Self-heal: if the JWT predates the current_org_id field but the user has
  // memberships, bind to the first org and rebake the cookie. Stops the
  // _authenticated → /login → /funnel redirect loop for stale sessions.
  let current_org_id = session.current_org_id ?? null;
  if (!current_org_id && orgs.length > 0) {
    current_org_id = orgs[0].id;
    await refreshCookieWithOrg(session, current_org_id);
  }
  return { current_org_id, orgs };
});

export const createOrg = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; logo_url?: string | null }) =>
    z
      .object({
        name: z.string().min(1).max(120),
        logo_url: z.string().url().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    const org = await createOrganization({
      name: data.name,
      createdBy: session.sub,
      logoUrl: data.logo_url ?? null,
    });
    await refreshCookieWithOrg(session, org.id);
    return org;
  });

const METHODOLOGY_VALUES = ["none", "BANT", "MEDDIC", "MEDDPICC", "SPIN", "CHAMP"] as const;
export const SYSTEM_PROMPT_MAX = 4000;

export const updateOrg = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      org_id: string;
      name?: string;
      logo_url?: string | null;
      sales_methodology?: (typeof METHODOLOGY_VALUES)[number];
      system_prompt?: string | null;
    }) =>
      z
        .object({
          org_id: z.string().min(1),
          name: z.string().min(1).max(120).optional(),
          logo_url: z.string().url().max(500).nullable().optional(),
          sales_methodology: z.enum(METHODOLOGY_VALUES).optional(),
          system_prompt: z.string().max(SYSTEM_PROMPT_MAX).nullable().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    await requireOrgRole(data.org_id, session.sub, "admin");
    const result = await updateOrganization(data.org_id, {
      name: data.name,
      logo_url: data.logo_url,
      sales_methodology: data.sales_methodology,
      system_prompt:
        data.system_prompt === undefined
          ? undefined
          : data.system_prompt && data.system_prompt.trim().length > 0
            ? data.system_prompt
            : null,
    });
    await logAuditEvent({
      orgId: data.org_id,
      actorUserId: session.sub,
      action: "org.updated",
      details: {
        name: data.name ?? null,
        logo_url: data.logo_url === undefined ? null : data.logo_url,
        sales_methodology: data.sales_methodology ?? null,
        system_prompt_changed: data.system_prompt !== undefined,
      },
    });
    // If the caller's active org is this one and they just changed the org
    // system prompt, rebake their cookie so the new prompt rides the JWT on
    // the next chat connection. Other org members will see the change on
    // their next session refresh.
    if (
      data.system_prompt !== undefined &&
      session.current_org_id === data.org_id
    ) {
      await refreshCookieWithOrg(session, data.org_id);
    }
    return result;
  });

export const getOrgDetails = createServerFn({ method: "GET" })
  .inputValidator((d: { org_id: string }) =>
    z.object({ org_id: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (!(await isMember(data.org_id, session.sub))) {
      throw new Error("You are not a member of that organization");
    }
    const [org, members, invites] = await Promise.all([
      getOrganization(data.org_id),
      listMembers(data.org_id),
      listPendingInvitations(data.org_id),
    ]);
    if (!org) throw new Error("Organization not found");
    return { org, members, invites };
  });

// Build a signed campaign URL that auto-identifies the recipient when they
// land. Used by the "Sign a campaign link" helper on Settings → Technical and
// by any customer code that wants to mint links server-side (their backend
// can also do this directly — the algorithm is documented in
// `docs/visitor-identification.md`).
export const signTrackingLink = createServerFn({ method: "POST" })
  .inputValidator((d: { org_id: string; email: string; url: string }) =>
    z
      .object({
        org_id: z.string().min(1),
        email: z.string().email().max(200),
        url: z.string().url().max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (!(await isMember(data.org_id, session.sub))) {
      throw new Error("You are not a member of that organization");
    }
    const org = await getOrganization(data.org_id);
    if (!org) throw new Error("Organization not found");
    const token = await signCremaEid(data.email, org.tracking_secret);
    const url = new URL(data.url);
    url.searchParams.set("crema_eid", token);
    return { signed_url: url.toString(), token };
  });

export const inviteToOrg = createServerFn({ method: "POST" })
  .inputValidator((d: { org_id: string; email: string }) =>
    z
      .object({
        org_id: z.string().min(1),
        email: z.string().email().max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    await requireOrgRole(data.org_id, session.sub, "admin");
    const invite = await createInvitation({
      orgId: data.org_id,
      email: data.email,
      invitedBy: session.sub,
    });
    await logAuditEvent({
      orgId: data.org_id,
      actorUserId: session.sub,
      action: "member.invited",
      details: { email: data.email, invitation_id: invite.id },
    });
    return invite;
  });

export const revokeOrgInvitation = createServerFn({ method: "POST" })
  .inputValidator((d: { org_id: string; invitation_id: string }) =>
    z
      .object({
        org_id: z.string().min(1),
        invitation_id: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    await requireOrgRole(data.org_id, session.sub, "admin");
    await revokeInvitation(data.invitation_id, data.org_id);
    await logAuditEvent({
      orgId: data.org_id,
      actorUserId: session.sub,
      action: "member.invite_revoked",
      details: { invitation_id: data.invitation_id },
    });
    return { ok: true };
  });

// Self-leave is always allowed (you can leave any org you're in). Removing
// someone else requires `admin`; removing an `owner` requires `owner`. The
// last `owner` of an org cannot be removed at all (would orphan the org —
// transfer ownership first).
export const removeOrgMember = createServerFn({ method: "POST" })
  .inputValidator((d: { org_id: string; user_id: string }) =>
    z
      .object({
        org_id: z.string().min(1),
        user_id: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    const callerRole = await getMemberRole(data.org_id, session.sub);
    if (!callerRole) {
      throw new Error("You are not a member of that organization");
    }
    const targetRole = await getMemberRole(data.org_id, data.user_id);
    if (!targetRole) {
      throw new Error("That user is not a member of this organization");
    }

    const removedSelf = data.user_id === session.sub;
    if (!removedSelf) {
      if (callerRole === "member") {
        throw new Error("This action requires the admin role");
      }
      if (targetRole === "owner" && callerRole !== "owner") {
        throw new Error("Only an owner can remove another owner");
      }
    }
    if (targetRole === "owner") {
      const owners = await countOwners(data.org_id);
      if (owners <= 1) {
        throw new Error(
          "Cannot remove the last owner — transfer ownership first",
        );
      }
    }

    await removeMember(data.org_id, data.user_id);
    await logAuditEvent({
      orgId: data.org_id,
      actorUserId: session.sub,
      action: removedSelf ? "member.self_left" : "member.removed",
      targetUserId: data.user_id,
      details: { prior_role: targetRole },
    });

    let nextOrgId: string | null = null;
    if (removedSelf) {
      const remaining = await listMyOrganizations(session.sub);
      nextOrgId = remaining[0]?.id ?? null;
      await refreshCookieWithOrg(session, nextOrgId ?? undefined);
    }
    return { ok: true, removed_self: removedSelf, next_org_id: nextOrgId };
  });

export const previewInvitation = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) =>
    z.object({ token: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const invite = await getInvitationByToken(data.token);
    if (!invite || invite.status !== "pending") {
      return { ok: false as const, reason: "not_found" as const };
    }
    const org = await getOrganization(invite.org_id);
    if (!org) return { ok: false as const, reason: "not_found" as const };
    return {
      ok: true as const,
      org: { id: org.id, name: org.name, logo_url: org.logo_url },
      email: invite.email,
    };
  });

export const acceptOrgInvitation = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) =>
    z.object({ token: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    const { orgId } = await acceptInvitation({
      token: data.token,
      userId: session.sub,
      userEmail: session.email,
    });
    await refreshCookieWithOrg(session, orgId);
    return { ok: true, org_id: orgId };
  });

export const getOrgStageProbabilities = createServerFn({ method: "GET" })
  .inputValidator((d: { org_id: string }) =>
    z.object({ org_id: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (!(await isMember(data.org_id, session.sub))) {
      throw new Error("You are not a member of that organization");
    }
    return await listStageProbabilities(data.org_id);
  });

export const updateOrgStageProbability = createServerFn({ method: "POST" })
  .inputValidator((d: { org_id: string; stage: DealStage; probability: number }) =>
    z
      .object({
        org_id: z.string().min(1),
        stage: z.enum(DEAL_STAGES),
        probability: z.number().int().min(0).max(100),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    await requireOrgRole(data.org_id, session.sub, "admin");
    const result = await setStageProbability(data.org_id, data.stage, data.probability);
    await logAuditEvent({
      orgId: data.org_id,
      actorUserId: session.sub,
      action: "org.stage_probability_changed",
      details: { stage: data.stage, probability: data.probability },
    });
    return result;
  });

// All orgs in the system. Super-admin only — this is the cross-org view that
// powers the "move user to another org" admin panel.
export const listAllOrgs = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  await requireSuperAdmin(session.sub);
  return await listAllOrganizations();
});

// Atomic transfer: remove the target user from `from_org_id`, add them to
// `to_org_id`. Super-admin only — this is a cross-org operation. The
// transferred user lands in `to_org_id` as a plain `member`; promote them
// after the move if they need more. If the caller moves themselves, their
// JWT cookie is rebaked so current_org_id points at the new org.
export const moveUserToOrg = createServerFn({ method: "POST" })
  .inputValidator((d: { user_id: string; from_org_id: string; to_org_id: string }) =>
    z
      .object({
        user_id: z.string().min(1),
        from_org_id: z.string().min(1),
        to_org_id: z.string().min(1),
      })
      .refine((v) => v.from_org_id !== v.to_org_id, {
        message: "Source and target organizations must differ",
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    await requireSuperAdmin(session.sub);
    if (!(await isMember(data.from_org_id, data.user_id))) {
      throw new Error("That user is not a member of the source organization");
    }
    const target = await getOrganization(data.to_org_id);
    if (!target) throw new Error("Target organization not found");

    await removeMember(data.from_org_id, data.user_id);
    await addMember(data.to_org_id, data.user_id);
    await logAuditEvent({
      orgId: data.from_org_id,
      actorUserId: session.sub,
      action: "member.moved_out",
      targetUserId: data.user_id,
      details: { to_org_id: data.to_org_id },
    });
    await logAuditEvent({
      orgId: data.to_org_id,
      actorUserId: session.sub,
      action: "member.moved_in",
      targetUserId: data.user_id,
      details: { from_org_id: data.from_org_id },
    });

    const movedSelf = data.user_id === session.sub;
    if (movedSelf) {
      await refreshCookieWithOrg(session, data.to_org_id);
    }
    return { ok: true, moved_self: movedSelf, to_org_id: data.to_org_id };
  });

// Every user in the system, each with their org memberships. Super-admin
// only — this is the cross-org "all users" admin panel.
export const listUsers = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  await requireSuperAdmin(session.sub);
  return await listAllUsers();
});

// Set a user's organization from the all-users panel. Drops their other
// memberships so "their org" stays single-valued (the panel shows one
// dropdown per user). Super-admin only — this overrides whatever the user
// had before. If the caller reassigns themselves, the JWT cookie is
// rebaked so the next request lands on the right org context.
export const setUserOrg = createServerFn({ method: "POST" })
  .inputValidator((d: { user_id: string; org_id: string }) =>
    z
      .object({
        user_id: z.string().min(1),
        org_id: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    await requireSuperAdmin(session.sub);
    const target = await getOrganization(data.org_id);
    if (!target) throw new Error("Target organization not found");
    await setUserSoleOrg(data.user_id, data.org_id);
    await logAuditEvent({
      orgId: data.org_id,
      actorUserId: session.sub,
      action: "member.assigned_by_super_admin",
      targetUserId: data.user_id,
    });
    const changedSelf = data.user_id === session.sub;
    if (changedSelf) {
      await refreshCookieWithOrg(session, data.org_id);
    }
    return { ok: true, changed_self: changedSelf, org_id: data.org_id };
  });

export const switchOrg = createServerFn({ method: "POST" })
  .inputValidator((d: { org_id: string }) =>
    z.object({ org_id: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    // Super admins can context-switch into any org for cross-org visibility;
    // ordinary users only into orgs they belong to.
    if (!session.is_super_admin && !(await isMember(data.org_id, session.sub))) {
      throw new Error("You are not a member of that organization");
    }
    await refreshCookieWithOrg(session, data.org_id);
    return { ok: true };
  });

// Promote / demote / transfer-ownership within an org.
//   - `admin` callers can set role between `member` and `admin`.
//   - `owner` callers can additionally set role to `owner` (transfer ownership).
//   - The last `owner` cannot be demoted (would orphan the org).
//   - Setting yourself to `owner` is allowed if you're already `owner`
//     (no-op) or if there's a pre-existing `owner` willing to grant it via
//     a separate call.
export const setOrgMemberRole = createServerFn({ method: "POST" })
  .inputValidator((d: { org_id: string; user_id: string; role: OrgRole }) =>
    z
      .object({
        org_id: z.string().min(1),
        user_id: z.string().min(1),
        role: z.enum(["owner", "admin", "member"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    const callerRole = await requireOrgRole(data.org_id, session.sub, "admin");
    const targetRole = await getMemberRole(data.org_id, data.user_id);
    if (!targetRole) {
      throw new Error("That user is not a member of this organization");
    }
    if (data.role === "owner" && callerRole !== "owner") {
      throw new Error("Only an owner can grant ownership");
    }
    if (targetRole === "owner" && callerRole !== "owner") {
      throw new Error("Only an owner can change another owner's role");
    }
    // Block demoting the final owner — the org needs at least one.
    if (targetRole === "owner" && data.role !== "owner") {
      const owners = await countOwners(data.org_id);
      if (owners <= 1) {
        throw new Error(
          "Cannot demote the last owner — promote someone else to owner first",
        );
      }
    }
    await setMemberRole(data.org_id, data.user_id, data.role);
    await logAuditEvent({
      orgId: data.org_id,
      actorUserId: session.sub,
      action: "member.role_changed",
      targetUserId: data.user_id,
      details: { from: targetRole, to: data.role },
    });
    return { ok: true, role: data.role };
  });

// Cross-org god mode. Only an existing super admin can mint or revoke another.
// Revoking the last super admin is blocked so the install always has at least
// one — otherwise nobody can promote anyone again.
export const grantSuperAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: { user_id: string }) =>
    z.object({ user_id: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    await requireSuperAdmin(session.sub);
    await setSuperAdmin(data.user_id, true);
    return { ok: true };
  });

export const revokeSuperAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: { user_id: string }) =>
    z.object({ user_id: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    await requireSuperAdmin(session.sub);
    // The install must keep at least one super admin so future promotions
    // remain possible. Block revoking the last one.
    const row = await getDB()
      .prepare(`SELECT COUNT(*) AS n FROM users WHERE is_super_admin = 1`)
      .first<{ n: number }>();
    if ((row?.n ?? 0) <= 1) {
      throw new Error("Cannot revoke the last super admin");
    }
    await setSuperAdmin(data.user_id, false);
    return { ok: true };
  });

// Org-scoped audit log. Any `admin` of the org can read it. Super admins can
// read any org's log (the UI filters by current org so super-admins can hop
// via switchOrg).
export const getOrgAuditLog = createServerFn({ method: "GET" })
  .inputValidator((d: { org_id: string; limit?: number }) =>
    z
      .object({
        org_id: z.string().min(1),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (!session.is_super_admin) {
      await requireOrgRole(data.org_id, session.sub, "admin");
    }
    return await listAuditLog(data.org_id, data.limit ?? 100);
  });
