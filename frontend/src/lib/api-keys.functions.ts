// Server functions backing the CLI / API settings page. They let a signed-in
// user mint, list, and revoke API keys for the public /api/v1 surface.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/auth/middleware";
import { getDB } from "@/db/env.server";
import { apiKeyDisplayPrefix, generateApiKeyPlaintext, hashApiKey } from "@/lib/api-keys.server";

export interface ApiKeySummary {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ keys: ApiKeySummary[] }> => {
    const rows = (
      await getDB()
        .prepare(
          `SELECT id, name, key_prefix, created_at, last_used_at, revoked_at
             FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
        )
        .bind(context.userId)
        .all<ApiKeySummary>()
    ).results;
    return { keys: rows };
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { name: string }) =>
    z.object({ name: z.string().trim().min(1).max(60) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const plaintext = generateApiKeyPlaintext();
    const hash = await hashApiKey(plaintext);
    const prefix = apiKeyDisplayPrefix(plaintext);
    const id = crypto.randomUUID();
    await getDB()
      .prepare(
        `INSERT INTO api_keys (id, user_id, org_id, name, key_hash, key_prefix)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, context.userId, context.currentOrgId, data.name, hash, prefix)
      .run();
    // `key` is the plaintext — returned exactly once, never retrievable again.
    return { id, name: data.name, key: plaintext, key_prefix: prefix };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await getDB()
      .prepare(
        `UPDATE api_keys SET revoked_at = datetime('now')
          WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
      )
      .bind(data.id, context.userId)
      .run();
    return { ok: true };
  });
