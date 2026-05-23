// Server-only helpers for the /api/v1 API-key auth path. Keys are opaque
// bearer tokens (`crema_sk_<64 hex>`); only their SHA-256 hash is persisted.
// See migrations/0021_api_keys.sql and the CLI in /cli.

import { getDB } from "@/db/env.server";
import type { AuthContext } from "@/auth/middleware";

export const API_KEY_PREFIX = "crema_sk_";

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True when a bearer token looks like a Crema API key rather than a JWT. */
export function isApiKeyToken(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}

/** SHA-256 hex digest — the only form of the key ever written to D1. */
export async function hashApiKey(plaintext: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(plaintext));
  return bytesToHex(new Uint8Array(digest));
}

/** Mint a fresh key. The plaintext is returned to the caller exactly once. */
export function generateApiKeyPlaintext(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return API_KEY_PREFIX + bytesToHex(bytes);
}

/** Short non-sensitive fragment kept for the management UI ("crema_sk_a1b2c3"). */
export function apiKeyDisplayPrefix(plaintext: string): string {
  return plaintext.slice(0, API_KEY_PREFIX.length + 6);
}

/**
 * Resolve an API key to the auth context of its owner. Returns null for an
 * unknown or revoked key. The owner's live role is read fresh from `users`
 * so a demotion takes effect immediately; the org is pinned to whatever was
 * current when the key was minted. Super-admin is never granted via a key.
 */
export async function resolveApiKeyAuth(token: string): Promise<AuthContext | null> {
  const hash = await hashApiKey(token);
  const row = await getDB()
    .prepare(
      `SELECT k.id AS key_id, k.org_id AS key_org_id,
              u.id AS user_id, u.email AS email, u.role AS role
         FROM api_keys k JOIN users u ON u.id = k.user_id
        WHERE k.key_hash = ? AND k.revoked_at IS NULL`,
    )
    .bind(hash)
    .first<{
      key_id: string;
      key_org_id: string | null;
      user_id: string;
      email: string;
      role: string;
    }>();
  if (!row) return null;

  // Best-effort "last used" stamp — a failure here must not fail the request.
  try {
    await getDB()
      .prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?")
      .bind(row.key_id)
      .run();
  } catch {
    /* non-fatal: telemetry only */
  }

  const role: AuthContext["role"] =
    row.role === "admin" || row.role === "manager" ? row.role : "rep";
  return {
    userId: row.user_id,
    email: row.email,
    role,
    currentOrgId: row.key_org_id,
    isSuperAdmin: false,
  };
}
