// Single-attempt webhook delivery worker. Signs the body with HMAC-SHA256
// (Stripe-shape over `<ts>.<rawBody>`), POSTs once with a 10s timeout, and
// logs the outcome to webhook_deliveries plus the parent subscription's
// last_delivery_at / last_status. Never throws — runs inside ctx.waitUntil.
// See Webhooks/DESIGN.md → Wire format — generic JSON, Failure model.
import { getDB } from "@/db/env.server";
import {
  WEBHOOK_CONTENT_TYPE,
  WEBHOOK_DELIVERY_ID_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_USER_AGENT,
  type WebhookEvent,
} from "@/lib/webhooks/events";
import { signBody } from "@/lib/webhooks/signing";
import { transformForSlack } from "@/lib/webhooks/slack-format";
import type { WebhookPayload, WebhookSubscriptionRow } from "@/lib/webhooks/types";

export type { WebhookPayload, WebhookSubscriptionRow };

const DELIVERY_TIMEOUT_MS = 10_000;
const RESPONSE_SNIPPET_MAX = 500;

export async function deliverOnce(params: {
  subscription: WebhookSubscriptionRow;
  event: WebhookEvent;
  payload: WebhookPayload;
}): Promise<void> {
  const { subscription, event, payload } = params;

  try {
    const deliveryId = crypto.randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);

    // The exact bytes we POST are the exact bytes we sign — the receiver
    // recomputes HMAC over `${ts}.${rawBody}` and any re-stringify would
    // break verification. Cache rawBody and reuse it for both calls.
    const body = subscription.format === "slack" ? transformForSlack(event, payload) : payload;
    const rawBody = JSON.stringify(body);

    let status: number | null = null;
    let snippet: string | null = null;
    let succeeded = 0;
    let errorMessage: string | null = null;
    const startedAt = Date.now();

    try {
      const signature = await signBody(subscription.secret, timestamp, rawBody);
      const res = await fetch(subscription.url, {
        method: "POST",
        headers: {
          "content-type": WEBHOOK_CONTENT_TYPE,
          "user-agent": WEBHOOK_USER_AGENT,
          [WEBHOOK_EVENT_HEADER]: event,
          [WEBHOOK_DELIVERY_ID_HEADER]: deliveryId,
          [WEBHOOK_TIMESTAMP_HEADER]: String(timestamp),
          [WEBHOOK_SIGNATURE_HEADER]: signature,
        },
        body: rawBody,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });
      status = res.status;
      const text = await res.text();
      snippet = text.length > RESPONSE_SNIPPET_MAX ? text.slice(0, RESPONSE_SNIPPET_MAX) : text;
      succeeded = res.ok ? 1 : 0;
    } catch (err) {
      // Network failure, timeout (AbortError), DNS, TLS — all collapsed
      // to status=0 with the error string captured for the audit log.
      status = 0;
      succeeded = 0;
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    const durationMs = Date.now() - startedAt;

    const db = getDB();
    await db
      .prepare(
        `INSERT INTO webhook_deliveries
           (id, subscription_id, org_id, event, payload_json,
            status, response_snippet, duration_ms, succeeded, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        deliveryId,
        subscription.id,
        subscription.org_id,
        event,
        rawBody,
        status,
        snippet,
        durationMs,
        succeeded,
        errorMessage,
      )
      .run();
    await db
      .prepare(
        `UPDATE webhook_subscriptions
           SET last_delivery_at = ?, last_status = ?
         WHERE id = ?`,
      )
      .bind(new Date().toISOString(), status, subscription.id)
      .run();
  } catch (err) {
    // Final safety net — waitUntil callers must never see a rejection.
    console.error(
      "[webhooks.deliver] unhandled failure",
      { subscriptionId: subscription.id, event },
      err,
    );
  }
}
