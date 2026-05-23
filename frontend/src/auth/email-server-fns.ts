// Email-verification server fns. Phase 03 (verify-side only — signup
// integration lands separately when the flow is fully wired).
//
// consumeVerificationToken is callable without a session: the token IS the
// proof of ownership, same as password-reset links and invite tokens.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDB } from "@/db/env.server";

export type ConsumeResult =
  | { ok: true; email: string; kind: "initial" | "change" }
  | { ok: false; reason: "invalid" | "already_used" | "expired" | "stale" };

export const consumeVerificationToken = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) =>
    z.object({ token: z.string().min(8).max(200) }).parse(d),
  )
  .handler(async ({ data }): Promise<ConsumeResult> => {
    const db = getDB();
    const tokenHash = await sha256Hex(data.token);
    const row = await db
      .prepare(
        `SELECT id, user_id, email, expires_at, consumed_at
           FROM email_verification_tokens WHERE token_hash = ?`,
      )
      .bind(tokenHash)
      .first<{
        id: string;
        user_id: string;
        email: string;
        expires_at: string;
        consumed_at: string | null;
      }>();
    if (!row) return { ok: false, reason: "invalid" };
    if (row.consumed_at) return { ok: false, reason: "already_used" };
    if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };

    const user = await db
      .prepare("SELECT email, pending_email FROM users WHERE id = ?")
      .bind(row.user_id)
      .first<{ email: string; pending_email: string | null }>();
    if (!user) return { ok: false, reason: "invalid" };

    const isInitial = user.email === row.email;
    const isChange = user.pending_email === row.email;
    if (!isInitial && !isChange) return { ok: false, reason: "stale" };

    // Mark consumed first so a double-click can't double-promote.
    await db
      .prepare(`UPDATE email_verification_tokens SET consumed_at = datetime('now') WHERE id = ?`)
      .bind(row.id)
      .run();

    if (isChange) {
      // Promote pending → primary. Refuse if another user has claimed the new
      // email in the meantime.
      const collision = await db
        .prepare("SELECT id FROM users WHERE email = ? AND id != ?")
        .bind(row.email, row.user_id)
        .first();
      if (collision) return { ok: false, reason: "stale" };
      await db
        .prepare(
          `UPDATE users
              SET email = ?, email_verified_at = datetime('now'), pending_email = NULL
            WHERE id = ?`,
        )
        .bind(row.email, row.user_id)
        .run();
      return { ok: true, email: row.email, kind: "change" };
    }

    await db
      .prepare(`UPDATE users SET email_verified_at = datetime('now') WHERE id = ?`)
      .bind(row.user_id)
      .run();
    return { ok: true, email: row.email, kind: "initial" };
  });

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
