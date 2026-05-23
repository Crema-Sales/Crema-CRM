// In-process entry point for outbound webhooks. Mutation handlers call
// emitWebhookEvent() synchronously in their post-write tail; the actual
// fan-out runs inside ctx.waitUntil so user-facing latency is unaffected.
// See Webhooks/DESIGN.md → Anatomy, Failure model.
import { getDB, getExecutionCtx } from "@/db/env.server";
import { deliverOnce } from "@/lib/webhooks/deliver";
import type { WebhookEvent } from "@/lib/webhooks/events";
import {
  parseEvents,
  type WebhookPayload,
  type WebhookSubscriptionRow,
} from "@/lib/webhooks/types";

// Fetch every enabled subscription for the org and JS-filter on the event
// list. Volume per org is small (handful of subs), so a JSON1 LIKE hack
// would be more brittle than just parsing in TS. Subs whose `events` JSON
// is malformed are dropped silently — Phase 02 server-fns enforce shape on
// write, this is a belt-and-braces guard for hand-written SQL / tests.
export async function loadActiveSubscriptions(
  orgId: string,
  event: WebhookEvent,
): Promise<WebhookSubscriptionRow[]> {
  const db = getDB();
  const result = await db
    .prepare(
      `SELECT id, org_id, name, url, secret, events, format, enabled,
              created_by, created_at, last_delivery_at, last_status
         FROM webhook_subscriptions
        WHERE org_id = ? AND enabled = 1`,
    )
    .bind(orgId)
    .all<WebhookSubscriptionRow>();
  const rows = result.results ?? [];
  return rows.filter((row) => parseEvents(row).includes(event));
}

// Fire-and-forget emit. NOT async on purpose — callers in crm.functions.ts
// must not pay queue-lookup latency. The async work (D1 read + fan-out)
// lives inside ctx.waitUntil; when ctx is unavailable (tests, prerender)
// the task is left dangling so the host await chain can observe rejections
// if it wants to, but we don't block the caller waiting on it.
export function emitWebhookEvent(
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): void {
  const ctx = getExecutionCtx();
  const task = (async () => {
    try {
      const subs = await loadActiveSubscriptions(orgId, event);
      if (subs.length === 0) return;
      const occurredAt = new Date().toISOString();
      await Promise.all(
        subs.map((subscription) => {
          const payload: WebhookPayload = {
            id: crypto.randomUUID(),
            event,
            org_id: orgId,
            occurred_at: occurredAt,
            data,
          };
          return deliverOnce({ subscription, event, payload });
        }),
      );
    } catch (err) {
      console.error("[webhooks.emit]", event, err);
    }
  })();
  if (ctx) ctx.waitUntil(task);
}
