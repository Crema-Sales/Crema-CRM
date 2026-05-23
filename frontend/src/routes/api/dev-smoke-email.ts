// Dev/staging smoke for the Resend email stack. Gated by the DEV_SMOKE_KEY
// secret (header `x-dev-key`) so it can run in production safely — the route
// 404s without the secret. DELETE once the live signup + tracker flows
// (Phases 03/04) obsolete it.
//
//   curl -X POST \
//     -H 'Content-Type: application/json' \
//     -H "x-dev-key: $DEV_SMOKE_KEY" \
//     -d '{"to":"pedram@cremasales.com","template":"verification"}' \
//     https://cremasales.com/api/dev-smoke-email
//
// templates:
//   - "verification"        — mints a real DB token, link consumable by /verify-email/$token
//   - "verification-change" — same but kind=change (pending_email path)
//   - "ack"                 — no token, just renders the ack body

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { sendEmail } from "@/lib/email/client";
import { verificationEmail } from "@/lib/email/templates/verification";
import { ackEmail } from "@/lib/email/templates/ack";
import { mailingListAck } from "@/lib/email/templates/mailing-list";
import { demoRequestAck } from "@/lib/email/templates/demo-request";
import { getDB, getEnv } from "@/db/env.server";

const Payload = z.object({
  to: z.string().email().max(200),
  template: z
    .enum(["verification", "verification-change", "ack", "mailing-list", "demo-request"])
    .default("verification"),
});

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Ensure a users row exists for the recipient. If one doesn't, we mint a
// throwaway record (impossible-to-use password hash) so the verification
// machinery has something to bind a token + email_verified_at to. Real
// signups (Phase 03 full) use the normal signUp server fn.
async function ensureUserForSmoke(email: string): Promise<{ id: string; existed: boolean }> {
  const db = getDB();
  const normalized = email.toLowerCase().trim();
  const existing = await db
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(normalized)
    .first<{ id: string }>();
  if (existing) return { id: existing.id, existed: true };
  const id = crypto.randomUUID();
  // 64 bytes of random hex → no-one will ever auth as this user via password
  // (the real signUp/signIn fn uses hashPassword which produces a different
  // format). Smoke-created users only matter for the verify-email flow.
  const filler = crypto.randomUUID() + crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, full_name, role)
       VALUES (?, ?, ?, ?, ?, 'rep')`,
    )
    .bind(id, normalized, filler, filler, "Smoke Test Recipient")
    .run();
  return { id, existed: false };
}

async function mintVerificationToken(userId: string, email: string): Promise<string> {
  const db = getDB();
  const token = crypto.randomUUID();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  // Revoke prior pending tokens for this user → only the freshest link works.
  await db
    .prepare(
      `UPDATE email_verification_tokens
          SET consumed_at = datetime('now')
        WHERE user_id = ? AND consumed_at IS NULL`,
    )
    .bind(userId)
    .run();
  await db
    .prepare(
      `INSERT INTO email_verification_tokens (id, user_id, token_hash, email, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), userId, tokenHash, email, expiresAt)
    .run();
  return token;
}

export const Route = createFileRoute("/api/dev-smoke-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = getEnv();
        const expected = env.DEV_SMOKE_KEY;
        const provided = request.headers.get("x-dev-key");
        if (!expected || !provided || provided !== expected) {
          return new Response(JSON.stringify({ error: "not_found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        let parsed: z.infer<typeof Payload>;
        try {
          parsed = Payload.parse(await request.json());
        } catch (e) {
          return new Response(JSON.stringify({ error: "invalid_payload", detail: String(e) }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const base = env.APP_BASE_URL;
        const toEmail = parsed.to.toLowerCase().trim();

        let rendered;
        let mintedToken: string | undefined;
        let userId: string | undefined;
        let category: "ack" | "verification" | "marketing" | "notification" = "verification";

        if (parsed.template === "ack") {
          rendered = ackEmail({
            fullName: null,
            orgName: "Crema",
            unsubscribeUrl: `${base}/unsubscribe/smoke-token?c=ack`,
          });
          category = "ack";
        } else if (parsed.template === "mailing-list") {
          rendered = mailingListAck({
            fullName: "there",
            unsubscribeUrl: `${base}/unsubscribe/pending?c=marketing&email=${encodeURIComponent(toEmail)}`,
          });
          category = "marketing";
        } else if (parsed.template === "demo-request") {
          rendered = demoRequestAck({
            fullName: "there",
            company: "Acme Coffee Roasters",
            unsubscribeUrl: `${base}/unsubscribe/pending?c=marketing&email=${encodeURIComponent(toEmail)}`,
          });
          category = "notification";
        } else {
          // Both verification variants mint a real DB token.
          const user = await ensureUserForSmoke(toEmail);
          userId = user.id;

          if (parsed.template === "verification-change") {
            // For the change-variant smoke, set pending_email on the user so
            // the token's email matches user.pending_email at consume time.
            await getDB()
              .prepare(`UPDATE users SET pending_email = ? WHERE id = ?`)
              .bind(toEmail, userId)
              .run();
          }

          mintedToken = await mintVerificationToken(userId, toEmail);
          const verifyUrl = `${base}/verify-email/${mintedToken}?email=${encodeURIComponent(toEmail)}`;
          rendered = verificationEmail({
            fullName: "there",
            verifyUrl,
            kind: parsed.template === "verification-change" ? "change" : "initial",
          });
          category = "verification";
        }

        try {
          const result = await sendEmail({
            to: toEmail,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            category,
          });
          return Response.json({
            ...result,
            template: parsed.template,
            subject: rendered.subject,
            userId,
            tokenIssued: !!mintedToken,
          });
        } catch (e) {
          const err = e as { message: string; status?: number; body?: string };
          return new Response(
            JSON.stringify({ error: "send_failed", message: err.message, status: err.status, body: err.body }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
