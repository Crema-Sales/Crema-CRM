// D1 helpers for webhook_subscriptions + webhook_deliveries. No auth, no
// server-fn shell — those live in lib/webhooks.functions.ts and call these.
// Mirrors the updateOrganization partial-update pattern in lib/orgs.server.ts.
// See Webhooks/DESIGN.md → Data model.
import { getDB } from "@/db/env.server";
import type { WebhookEvent } from "@/lib/webhooks/events";
import { generateSecret } from "@/lib/webhooks/signing";
import type { WebhookDeliveryRow, WebhookSubscriptionRow } from "@/lib/webhooks/types";

export type { WebhookDeliveryRow, WebhookSubscriptionRow };

const SUBSCRIPTION_COLUMNS = `id, org_id, name, url, secret, events, format,
  enabled, created_by, created_at, last_delivery_at, last_status`;

const DELIVERY_COLUMNS = `id, subscription_id, org_id, event, payload_json,
  status, response_snippet, duration_ms, succeeded, error, attempted_at`;

const DELIVERIES_DEFAULT_LIMIT = 50;
const DELIVERIES_MAX_LIMIT = 200;

function uuid(): string {
  return crypto.randomUUID();
}

export async function listSubscriptions(orgId: string): Promise<WebhookSubscriptionRow[]> {
  const db = getDB();
  const result = await db
    .prepare(
      `SELECT ${SUBSCRIPTION_COLUMNS}
         FROM webhook_subscriptions
        WHERE org_id = ?
        ORDER BY created_at DESC`,
    )
    .bind(orgId)
    .all<WebhookSubscriptionRow>();
  return result.results ?? [];
}

export async function countSubscriptions(orgId: string): Promise<number> {
  const db = getDB();
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM webhook_subscriptions WHERE org_id = ?`)
    .bind(orgId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getSubscription(
  id: string,
  orgId: string,
): Promise<WebhookSubscriptionRow | null> {
  const db = getDB();
  return await db
    .prepare(
      `SELECT ${SUBSCRIPTION_COLUMNS}
         FROM webhook_subscriptions
        WHERE id = ? AND org_id = ?`,
    )
    .bind(id, orgId)
    .first<WebhookSubscriptionRow>();
}

export async function createSubscription(input: {
  org_id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  format: "json" | "slack";
  created_by: string;
}): Promise<WebhookSubscriptionRow> {
  const db = getDB();
  const id = uuid();
  const secret = generateSecret();
  await db
    .prepare(
      `INSERT INTO webhook_subscriptions
         (id, org_id, name, url, secret, events, format, enabled, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .bind(
      id,
      input.org_id,
      input.name,
      input.url,
      secret,
      JSON.stringify(input.events),
      input.format,
      input.created_by,
    )
    .run();
  const row = await getSubscription(id, input.org_id);
  if (!row) throw new Error("Failed to read back created webhook subscription");
  return row;
}

export async function updateSubscription(
  id: string,
  orgId: string,
  patch: {
    name?: string;
    url?: string;
    events?: WebhookEvent[];
    format?: "json" | "slack";
    enabled?: boolean;
  },
): Promise<WebhookSubscriptionRow> {
  const db = getDB();
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    args.push(patch.name);
  }
  if (patch.url !== undefined) {
    sets.push("url = ?");
    args.push(patch.url);
  }
  if (patch.events !== undefined) {
    sets.push("events = ?");
    args.push(JSON.stringify(patch.events));
  }
  if (patch.format !== undefined) {
    sets.push("format = ?");
    args.push(patch.format);
  }
  if (patch.enabled !== undefined) {
    sets.push("enabled = ?");
    args.push(patch.enabled ? 1 : 0);
  }
  if (sets.length === 0) {
    const row = await getSubscription(id, orgId);
    if (!row) throw new Error("Webhook subscription not found");
    return row;
  }
  args.push(id, orgId);
  await db
    .prepare(
      `UPDATE webhook_subscriptions
          SET ${sets.join(", ")}
        WHERE id = ? AND org_id = ?`,
    )
    .bind(...args)
    .run();
  const row = await getSubscription(id, orgId);
  if (!row) throw new Error("Webhook subscription not found");
  return row;
}

export async function regenerateSecret(
  id: string,
  orgId: string,
): Promise<{ id: string; secret: string }> {
  const db = getDB();
  const secret = generateSecret();
  await db
    .prepare(
      `UPDATE webhook_subscriptions
          SET secret = ?
        WHERE id = ? AND org_id = ?`,
    )
    .bind(secret, id, orgId)
    .run();
  return { id, secret };
}

export async function deleteSubscription(id: string, orgId: string): Promise<void> {
  const db = getDB();
  await db
    .prepare(`DELETE FROM webhook_subscriptions WHERE id = ? AND org_id = ?`)
    .bind(id, orgId)
    .run();
}

export async function listRecentDeliveries(
  orgId: string,
  opts?: { subscription_id?: string; limit?: number },
): Promise<WebhookDeliveryRow[]> {
  const db = getDB();
  const requested = opts?.limit ?? DELIVERIES_DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, requested), DELIVERIES_MAX_LIMIT);
  if (opts?.subscription_id) {
    const result = await db
      .prepare(
        `SELECT ${DELIVERY_COLUMNS}
           FROM webhook_deliveries
          WHERE org_id = ? AND subscription_id = ?
          ORDER BY attempted_at DESC
          LIMIT ?`,
      )
      .bind(orgId, opts.subscription_id, limit)
      .all<WebhookDeliveryRow>();
    return result.results ?? [];
  }
  const result = await db
    .prepare(
      `SELECT ${DELIVERY_COLUMNS}
         FROM webhook_deliveries
        WHERE org_id = ?
        ORDER BY attempted_at DESC
        LIMIT ?`,
    )
    .bind(orgId, limit)
    .all<WebhookDeliveryRow>();
  return result.results ?? [];
}
