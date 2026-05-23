// Server-fns for the password reset flow. Two surfaces share this file:
//   1. /login → "Forgot password?" — anonymous user requests by email.
//   2. /settings → Organization tab — an admin clicks "Send reset" on a
//      teammate, which mints a token and emails it to that user.
//   3. /reset-password/$token — the page the email links to. Validates the
//      token and sets the new password.
//
// Token model mirrors email_verification_tokens: 32 random bytes encoded as
// url-safe base64 (the value emailed), sha-256 hashed at rest. Single-use
// (consumed_at), 1h TTL. We never reveal whether an email exists — the
// "request" path returns { ok: true } unconditionally.

import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { hashPassword } from "./crypto";
import { authPayloadFromCookieHeader } from "./cookies.server";
import { getDB, getEnv } from "@/db/env.server";
import { isMember } from "@/lib/orgs.server";
import { sendEmail } from "@/lib/email/client";
import { passwordResetEmail } from "@/lib/email/templates/password-reset";

const RESET_TTL_SEC = 60 * 60; // 1 hour

function generateToken(): string {
  // 32 random bytes → 43 char url-safe base64. Same shape as invite tokens.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

interface UserLookup {
  id: string;
  email: string;
  full_name: string | null;
}

async function issueReset(opts: {
  user: UserLookup;
  requestedBy: string | null;
  kind: "self" | "admin";
}): Promise<void> {
  const db = getDB();
  const env = getEnv();
  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + RESET_TTL_SEC * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at, requested_by)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, opts.user.id, tokenHash, expiresAt, opts.requestedBy)
    .run();

  const base = env.APP_BASE_URL.replace(/\/$/, "");
  const resetUrl = `${base}/reset-password/${token}`;
  const rendered = passwordResetEmail({
    fullName: opts.user.full_name,
    resetUrl,
    kind: opts.kind,
  });

  await sendEmail({
    to: opts.user.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    // notification = transactional, ignores email_preferences. Password reset
    // must always reach the recipient even if they unsubscribed from marketing.
    category: "notification",
  });
}

// Anonymous request from the /login "Forgot password?" flow. Always returns
// { ok: true } regardless of whether the email is registered — prevents the
// endpoint from being used as an account-enumeration oracle.
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string }) =>
    z
      .object({
        email: z.string().email().max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = getDB();
    const email = data.email.toLowerCase().trim();
    const user = await db
      .prepare("SELECT id, email, full_name FROM users WHERE email = ?")
      .bind(email)
      .first<UserLookup>();
    if (user) {
      try {
        await issueReset({ user, requestedBy: user.id, kind: "self" });
      } catch (e) {
        // Swallow send errors here so the caller can't distinguish "no such
        // user" from "send failed". Errors are still captured in email_sends
        // for ops debugging.
        console.error("password reset send failed:", e);
      }
    }
    return { ok: true as const };
  });

// Admin path from /settings → Organization. Requires the caller to share an
// org with the target user. Returns the target email so the UI can show
// "Sent reset link to alex@example.com" instead of generic copy.
export const sendPasswordResetForMember = createServerFn({ method: "POST" })
  .inputValidator((d: { org_id: string; user_id: string }) =>
    z
      .object({
        org_id: z.string().min(1),
        user_id: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const req = getRequest();
    const session = await authPayloadFromCookieHeader(req?.headers?.get("cookie"));
    if (!session) {
      setResponseStatus(401);
      throw new Error("Unauthorized");
    }
    if (!(await isMember(data.org_id, session.sub))) {
      throw new Error("You are not a member of that organization");
    }
    if (!(await isMember(data.org_id, data.user_id))) {
      throw new Error("That user is not a member of this organization");
    }
    const db = getDB();
    const user = await db
      .prepare("SELECT id, email, full_name FROM users WHERE id = ?")
      .bind(data.user_id)
      .first<UserLookup>();
    if (!user) throw new Error("User not found");
    await issueReset({ user, requestedBy: session.sub, kind: "admin" });
    return { ok: true as const, email: user.email };
  });

// Lightweight precheck for the /reset-password/$token page so it can render
// "this link expired" without forcing the user to fill in a new password
// first. Returns the user's email on success for a friendlier UI.
export const peekPasswordResetToken = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) =>
    z.object({ token: z.string().min(1).max(200) }).parse(d),
  )
  .handler(async ({ data }) => {
    const db = getDB();
    const tokenHash = await sha256Hex(data.token);
    const row = await db
      .prepare(
        `SELECT pr.user_id, pr.expires_at, pr.consumed_at, u.email
         FROM password_resets pr
         JOIN users u ON u.id = pr.user_id
         WHERE pr.token_hash = ?`,
      )
      .bind(tokenHash)
      .first<{ user_id: string; expires_at: string; consumed_at: string | null; email: string }>();
    if (!row) return { ok: false as const, reason: "not_found" as const };
    if (row.consumed_at) return { ok: false as const, reason: "used" as const };
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { ok: false as const, reason: "expired" as const };
    }
    return { ok: true as const, email: row.email };
  });

export const completePasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; password: string }) =>
    z
      .object({
        token: z.string().min(1).max(200),
        password: z.string().min(6).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = getDB();
    const tokenHash = await sha256Hex(data.token);
    const row = await db
      .prepare(
        `SELECT id, user_id, expires_at, consumed_at
         FROM password_resets WHERE token_hash = ?`,
      )
      .bind(tokenHash)
      .first<{ id: string; user_id: string; expires_at: string; consumed_at: string | null }>();
    if (!row) throw new Error("This reset link is invalid.");
    if (row.consumed_at) throw new Error("This reset link has already been used.");
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("This reset link has expired. Request a new one.");
    }
    const { hash, salt } = await hashPassword(data.password);
    // Mark consumed first; if the password update fails we leave the token
    // burned (caller can request again). Avoids the inverse race where a
    // double-click lands two updates.
    await db
      .prepare(`UPDATE password_resets SET consumed_at = datetime('now') WHERE id = ?`)
      .bind(row.id)
      .run();
    await db
      .prepare(`UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?`)
      .bind(hash, salt, row.user_id)
      .run();
    return { ok: true as const };
  });
