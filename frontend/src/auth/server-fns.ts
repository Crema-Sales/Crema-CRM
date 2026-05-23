import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { hashPassword, verifyPassword, signJwt } from "./crypto";
import { authPayloadFromCookieHeader, buildAuthCookie, clearAuthCookie } from "./cookies.server";
import { getDB, getEnv } from "@/db/env.server";
import { addMember, getOrganization, listMyOrganizations } from "@/lib/orgs.server";

const SESSION_TTL_SEC = 60 * 60 * 24 * 7;

// True when a D1 write failed because it would violate a UNIQUE constraint.
// Used to recognise the sign-up INSERT losing a race to a concurrent twin of
// the same submission (double-fired form / retried POST).
function isUniqueConstraintError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /UNIQUE constraint failed/i.test(msg);
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  full_name: string | null;
  role: "admin" | "manager" | "rep";
  coach_persona_slug: string | null;
  system_prompt: string | null;
  is_super_admin: number;
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const d = email.slice(at + 1).toLowerCase();
  return d.length > 0 ? d : null;
}

export const signUp = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string; full_name?: string }) =>
    z.object({
      email: z.string().email().max(200),
      password: z.string().min(6).max(200),
      full_name: z.string().min(1).max(200).optional(),
    }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    const env = getEnv();
    const email = data.email.toLowerCase().trim();
    const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (existing) throw new Error("An account with this email already exists.");

    // Whoever stands up a fresh instance becomes the first super admin — they
    // can promote others from the UI. After that, the table is non-empty and
    // every subsequent signup defaults to ordinary `member`.
    const countRow = await db
      .prepare("SELECT COUNT(*) AS n FROM users")
      .first<{ n: number }>();
    const isFirstUser = (countRow?.n ?? 0) === 0;

    const { hash, salt } = await hashPassword(data.password);
    const id = crypto.randomUUID();
    // The SELECT above is not a lock: a concurrent twin of this same
    // submission (double-fired form, retried POST) can land the row between
    // that check and this INSERT. When it does, surface it as a recoverable
    // race rather than letting a raw `D1_ERROR: UNIQUE constraint failed`
    // reach the sign-up screen — that error strands the user on /login with a
    // scary toast even though their account now exists, and the post-signup
    // redirect to the coach picker never fires.
    let isNewRow = true;
    try {
      await db
        .prepare(
          "INSERT INTO users (id, email, password_hash, password_salt, full_name, role, is_super_admin) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id, email, hash, salt, data.full_name ?? null, "rep", isFirstUser ? 1 : 0)
        .run();
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      isNewRow = false;
    }
    // Resolve the row we (or our racing twin) created. On the happy path this
    // is our own INSERT; on the race path it's the twin's identical row.
    const user = await db
      .prepare(
        "SELECT id, password_hash, password_salt, is_super_admin FROM users WHERE email = ?",
      )
      .bind(email)
      .first<{ id: string; password_hash: string; password_salt: string; is_super_admin: number }>();
    if (!user) throw new Error("We couldn't finish creating your account. Please try again.");
    // If the row already existed, only proceed when the submitted credentials
    // match it — i.e. it genuinely is our racing twin, not a stranger who
    // happens to own this email. Mismatch → the normal "already exists".
    if (!isNewRow) {
      const ok = await verifyPassword(data.password, user.password_hash, user.password_salt);
      if (!ok) throw new Error("An account with this email already exists.");
    }
    const userId = user.id;

    // Domain-based auto-join. Only orgs that have proven they own the domain
    // (DNS TXT check stamped `domain_verified_at`) and explicitly opted in
    // (`domain_join_enabled = 1`) get to claim new signups. Free-email-provider
    // domains are blocked at the verification step, not here. Picks the
    // first match deterministically when multiple orgs (unlikely after
    // verification, but worth being defensive).
    let currentOrgId: string | undefined;
    let orgSystemPrompt: string | null = null;
    if (isNewRow) {
      const domain = domainOf(email);
      if (domain) {
        const match = await db
          .prepare(
            `SELECT id, system_prompt FROM organizations
              WHERE email_domain = ?
                AND domain_join_enabled = 1
                AND domain_verified_at IS NOT NULL
              ORDER BY created_at ASC
              LIMIT 1`,
          )
          .bind(domain)
          .first<{ id: string; system_prompt: string | null }>();
        if (match) {
          await addMember(match.id, userId);
          currentOrgId = match.id;
          orgSystemPrompt = match.system_prompt;
        }
      }
    }

    const token = await signJwt(
      {
        sub: userId,
        email,
        role: "rep",
        current_org_id: currentOrgId,
        org_system_prompt: orgSystemPrompt,
        is_super_admin: user.is_super_admin === 1 ? true : undefined,
      },
      env.JWT_SECRET,
      SESSION_TTL_SEC,
    );
    setResponseHeader("set-cookie", buildAuthCookie(token, SESSION_TTL_SEC));
    return {
      id: userId,
      email,
      role: "rep" as const,
      current_org_id: currentOrgId ?? null,
      is_super_admin: user.is_super_admin === 1,
    };
  });

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string }) =>
    z.object({
      email: z.string().email().max(200),
      password: z.string().min(1).max(200),
    }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    const env = getEnv();
    const email = data.email.toLowerCase().trim();
    const user = await db.prepare(
      "SELECT id, email, password_hash, password_salt, full_name, role, coach_persona_slug, system_prompt, is_super_admin FROM users WHERE email = ?",
    ).bind(email).first<UserRow>();
    if (!user) throw new Error("Invalid email or password.");
    const ok = await verifyPassword(data.password, user.password_hash, user.password_salt);
    if (!ok) throw new Error("Invalid email or password.");
    const orgs = await listMyOrganizations(user.id);
    const currentOrgId = orgs[0]?.id;
    const orgSystemPrompt = currentOrgId
      ? (await getOrganization(currentOrgId))?.system_prompt ?? null
      : null;
    const token = await signJwt(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        current_org_id: currentOrgId,
        coach_persona_slug: user.coach_persona_slug,
        org_system_prompt: orgSystemPrompt,
        user_system_prompt: user.system_prompt,
        is_super_admin: user.is_super_admin === 1 ? true : undefined,
      },
      env.JWT_SECRET,
      SESSION_TTL_SEC,
    );
    setResponseHeader("set-cookie", buildAuthCookie(token, SESSION_TTL_SEC));
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      current_org_id: currentOrgId ?? null,
      is_super_admin: user.is_super_admin === 1,
    };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  setResponseHeader("set-cookie", clearAuthCookie());
  return { ok: true };
});

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest();
  const payload = await authPayloadFromCookieHeader(req?.headers?.get("cookie"));
  if (!payload) {
    setResponseStatus(401);
    return null;
  }
  return {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    current_org_id: payload.current_org_id ?? null,
    coach_persona_slug: payload.coach_persona_slug ?? null,
    is_super_admin: payload.is_super_admin === true,
  };
});

// Like getSession() but never sets a 401 — for surfaces (marketing pages)
// that need to *probe* auth state to decide which CTA to show, without
// the side-effect of poisoning the SSR response status for anonymous
// visitors. Returns null silently when not logged in.
export const peekSession = createServerFn({ method: "GET" }).handler(async () => {
  const req = getRequest();
  const payload = await authPayloadFromCookieHeader(req?.headers?.get("cookie"));
  if (!payload) return null;
  return {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    current_org_id: payload.current_org_id ?? null,
    coach_persona_slug: payload.coach_persona_slug ?? null,
    is_super_admin: payload.is_super_admin === true,
  };
});
