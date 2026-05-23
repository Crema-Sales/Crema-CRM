// Shared row + payload shapes for the webhooks subsystem. Mirrors the D1
// tables 1:1 (snake_case) so we never translate between layers — the CRUD
// server-fns in Phase 02, the delivery worker, and the emit() entry point
// all consume the same interfaces. See Webhooks/DESIGN.md → Data model.
import type { WebhookEvent } from "@/lib/webhooks/events";

// webhook_subscriptions (migration 0005). `events` is a JSON-encoded
// WebhookEvent[]; use parseEvents() below to get a typed array back.
export interface WebhookSubscriptionRow {
  id: string;
  org_id: string;
  name: string;
  url: string;
  secret: string;
  events: string;
  format: "json" | "slack";
  enabled: number;
  created_by: string | null;
  created_at: string;
  last_delivery_at: string | null;
  last_status: number | null;
}

// webhook_deliveries (migration 0005). One row per POST attempt, written
// by deliverOnce() regardless of success — the audit trail the UI renders.
export interface WebhookDeliveryRow {
  id: string;
  subscription_id: string;
  org_id: string;
  event: string;
  payload_json: string;
  status: number | null;
  response_snippet: string | null;
  duration_ms: number | null;
  succeeded: number;
  error: string | null;
  attempted_at: string;
}

// Generic JSON envelope POSTed to receivers when format === "json". The
// Slack format wraps `data` differently (see transformForSlack in deliver.ts).
export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  org_id: string;
  occurred_at: string;
  data: Record<string, unknown>;
}

// Parse the JSON-encoded events column off a subscription row. Phase 02
// server-fns enforce shape on write, but hand-written SQL / test fixtures
// can still produce malformed JSON — silent fallback to [] keeps emit()
// from throwing inside a waitUntil-scheduled task.
export function parseEvents(row: Pick<WebhookSubscriptionRow, "events">): WebhookEvent[] {
  try {
    const parsed = JSON.parse(row.events) as unknown;
    return Array.isArray(parsed) ? (parsed as WebhookEvent[]) : [];
  } catch {
    return [];
  }
}
