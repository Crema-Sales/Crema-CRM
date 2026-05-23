// Canonical webhook event catalog. Single source of truth shared by emit(),
// signing, UI rendering, and validation. See Webhooks/DESIGN.md → Event catalog.
import { z } from "zod";

export const WEBHOOK_EVENTS = [
  "contact.created",
  "contact.archived",
  "contact.stage_changed",
  "deal.created",
  "deal.stage_changed",
  "deal.won",
  "deal.lost",
  "lead.created",
  "ticket.created",
  "ticket.status_changed",
  "ticket.resolved",
  "purchase.created",
  "relationship.status_changed",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_GROUPS: Record<string, WebhookEvent[]> = {
  contact: ["contact.created", "contact.archived", "contact.stage_changed"],
  deal: ["deal.created", "deal.stage_changed", "deal.won", "deal.lost"],
  lead: ["lead.created"],
  ticket: ["ticket.created", "ticket.status_changed", "ticket.resolved"],
  purchase: ["purchase.created"],
  relationship: ["relationship.status_changed"],
};

export const WebhookFormat = z.enum(["json", "slack"]);
export type WebhookFormat = z.infer<typeof WebhookFormat>;

export const WebhookEventList = z
  .array(z.enum(WEBHOOK_EVENTS as readonly [string, ...string[]]))
  .min(1);

export const WEBHOOK_USER_AGENT = "Crema-Webhooks/1.0";
export const WEBHOOK_CONTENT_TYPE = "application/json";
export const WEBHOOK_SIGNATURE_HEADER = "x-crema-signature";
export const WEBHOOK_EVENT_HEADER = "x-crema-event";
export const WEBHOOK_DELIVERY_ID_HEADER = "x-crema-delivery-id";
export const WEBHOOK_TIMESTAMP_HEADER = "x-crema-timestamp";
