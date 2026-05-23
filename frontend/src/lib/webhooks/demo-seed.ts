// Dev-only seed: inserts a pre-existing "Demo Slack" webhook subscription so
// judges opening Settings → Webhooks find a row to riff off without us
// teaching them the feature. `enabled = 0` and a non-resolving fake URL
// (`example.invalid`) mean it can never actually fire even if a curious
// viewer clicks "Send test" — RFC 2606 reserves `.invalid` precisely for
// this. NOT auto-run; invoke from a temporary dev surface before the demo.
// Invocation docs: AGENTS.md → "Webhooks (stretch)".
import { getDB } from "@/db/env.server";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhooks/events";
import { generateSecret } from "@/lib/webhooks/signing";

export const DEMO_SLACK_SUBSCRIPTION_NAME = "Demo Slack";
export const DEMO_SLACK_URL = "https://example.invalid/slack-demo";

// Three-event curated set mirrors the live Slack smoke from P05 task 3 so the
// demo subscription's event list reads as a plausible "what a sales team would
// actually subscribe to" — not noisy with every event in the catalog.
export const DEMO_SLACK_EVENTS: readonly WebhookEvent[] = [
  "deal.won",
  "ticket.created",
  "contact.stage_changed",
] as const;

// Per-org deterministic id — the subscriptions table PK is global TEXT, so
// scoping `demo-slack:<orgId>` lets multiple orgs hold the seed concurrently
// and keeps re-runs against the same org idempotent (INSERT OR IGNORE below).
export function demoSlackSubscriptionId(orgId: string): string {
  return `demo-slack:${orgId}`;
}

export interface SeedDemoSlackResult {
  id: string;
  inserted: boolean;
}

export async function seedDemoSlackSubscription(
  orgId: string,
  opts: { events?: readonly WebhookEvent[] } = {},
): Promise<SeedDemoSlackResult> {
  const events = opts.events ?? DEMO_SLACK_EVENTS;
  // Guard so non-catalog values can't slip into the row via opts.events; the
  // settings UI re-validates against WEBHOOK_EVENTS but the demo seed has no
  // such UI layer in front of it.
  for (const e of events) {
    if (!WEBHOOK_EVENTS.includes(e)) throw new Error(`Unknown webhook event: ${e}`);
  }
  const id = demoSlackSubscriptionId(orgId);
  const db = getDB();
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO webhook_subscriptions
         (id, org_id, name, url, secret, events, format, enabled, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'slack', 0, NULL)`,
    )
    .bind(
      id,
      orgId,
      DEMO_SLACK_SUBSCRIPTION_NAME,
      DEMO_SLACK_URL,
      generateSecret(),
      JSON.stringify([...events]),
    )
    .run();
  return { id, inserted: (result.meta?.changes ?? 0) > 0 };
}

export async function removeDemoSlackSubscription(orgId: string): Promise<void> {
  const id = demoSlackSubscriptionId(orgId);
  await getDB()
    .prepare(`DELETE FROM webhook_subscriptions WHERE id = ? AND org_id = ?`)
    .bind(id, orgId)
    .run();
}
