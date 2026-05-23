// Per-event Slack incoming-webhook renderers. The delivery worker hands us
// a generic WebhookPayload; we return a Slack `chat.postMessage`-shaped body
// (`text` for the notification preview, optional `blocks` for the rich
// surface). See Webhooks/DESIGN.md → Wire format — Slack preset.
import type { WebhookEvent } from "@/lib/webhooks/events";
import type { WebhookPayload } from "@/lib/webhooks/types";

// Slack Block Kit subset — only the three block shapes the templates use.
export type SlackBlock =
  | { type: "header"; text: { type: "plain_text"; text: string } }
  | { type: "section"; text: { type: "mrkdwn"; text: string } }
  | { type: "section"; fields: Array<{ type: "mrkdwn"; text: string }> };

export interface SlackBody {
  text: string;
  blocks?: SlackBlock[];
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const money = (n: unknown): string =>
  typeof n === "number" && Number.isFinite(n) ? USD.format(n) : "$—";

const header = (text: string): SlackBlock => ({
  type: "header",
  text: { type: "plain_text", text },
});

const section = (text: string): SlackBlock => ({
  type: "section",
  text: { type: "mrkdwn", text },
});

// Drops pairs whose value is null/undefined/empty so Slack doesn't show
// "*Email*\n—" rows for missing fields.
const fields = (pairs: Array<[string, unknown]>): SlackBlock => ({
  type: "section",
  fields: pairs
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([label, value]) => ({
      type: "mrkdwn",
      text: `*${label}*\n${String(value)}`,
    })),
});

// Narrow a `data` subtree to an object record without throwing on
// undefined / non-object values — templates fall back to {} so a missing
// `data.deal` doesn't crash the renderer.
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

type Renderer = (data: Record<string, unknown>) => SlackBody;

const RENDERERS: Record<WebhookEvent, Renderer> = {
  "contact.created": (data) => {
    const c = obj(data.contact);
    const name = (c.full_name as string) ?? "(unnamed)";
    return {
      text: `🆕 New contact: ${name}`,
      blocks: [
        header(`🆕 New contact: ${name}`),
        fields([
          ["Email", c.email],
          ["Title", c.title],
          ["Company", c.company_id],
        ]),
      ],
    };
  },

  "contact.archived": (data) => {
    const id = (data.contact_id as string) ?? "(unknown)";
    return {
      text: `🗑 Contact archived: ${id}`,
      blocks: [section(`🗑 Contact archived: \`${id}\``)],
    };
  },

  "contact.stage_changed": (data) => {
    const from = (data.from_stage as string) ?? "?";
    const to = (data.to_stage as string) ?? "?";
    const id = (data.contact_id as string) ?? "(unknown)";
    return {
      text: `🔁 Contact stage: ${from} → ${to}`,
      blocks: [section(`🔁 Contact stage: *${from}* → *${to}*`), fields([["Contact", id]])],
    };
  },

  "deal.created": (data) => {
    const d = obj(data.deal);
    const name = (d.name as string) ?? "(unnamed deal)";
    const value = money(d.value);
    return {
      text: `📂 Deal opened: ${name} — ${value}`,
      blocks: [
        header(`📂 Deal opened: ${name}`),
        fields([
          ["Value", value],
          ["Stage", d.stage],
          ["Owner", d.owner_id],
        ]),
      ],
    };
  },

  "deal.stage_changed": (data) => {
    const from = (data.from_stage as string) ?? "?";
    const to = (data.to_stage as string) ?? "?";
    const tag = (obj(data.deal).name as string) ?? (data.deal_id as string) ?? "(unknown deal)";
    return {
      text: `↔️ Deal stage: ${from} → ${to} (${tag})`,
      blocks: [section(`↔️ Deal stage: *${from}* → *${to}*  _(${tag})_`)],
    };
  },

  "deal.won": (data) => {
    const d = obj(data.deal);
    const name = (d.name as string) ?? "(unnamed deal)";
    const value = money(data.value ?? d.value);
    return {
      text: `🎉 Deal won: ${name} — ${value}`,
      blocks: [
        header(`🎉 Deal won: ${name}`),
        fields([
          ["Value", value],
          ["Stage", d.stage],
          ["Owner", d.owner_id],
        ]),
      ],
    };
  },

  "deal.lost": (data) => {
    const d = obj(data.deal);
    const name = (d.name as string) ?? "(unnamed deal)";
    return {
      text: `💀 Deal lost: ${name}`,
      blocks: [
        header(`💀 Deal lost: ${name}`),
        fields([
          ["Value", money(d.value)],
          ["Stage", d.stage],
        ]),
      ],
    };
  },

  "lead.created": (data) => {
    const l = obj(data.lead);
    const c = obj(l.contact);
    const who = (c.full_name as string) ?? (l.contact_id as string) ?? "(unknown contact)";
    return {
      text: `🌱 New lead: ${who}`,
      blocks: [
        header(`🌱 New lead: ${who}`),
        fields([
          ["Source", l.source],
          ["Score", l.score],
          ["Owner", l.owner_id],
        ]),
      ],
    };
  },

  "ticket.created": (data) => {
    const t = obj(data.ticket);
    const subject = (t.subject as string) ?? "(no subject)";
    const priority = (t.priority as string) ?? "normal";
    return {
      text: `🎫 New ticket [${priority}]: ${subject}`,
      blocks: [
        header(`🎫 New ticket [${priority}]: ${subject}`),
        fields([
          ["Status", t.status],
          ["Assignee", t.assigned_to],
          ["Contact", t.contact_id],
        ]),
      ],
    };
  },

  "ticket.status_changed": (data) => {
    const id = (data.ticket_id as string) ?? "(unknown)";
    const from = (data.from_status as string) ?? "?";
    const to = (data.to_status as string) ?? "?";
    return {
      text: `🔁 Ticket ${id}: ${from} → ${to}`,
      blocks: [section(`🔁 Ticket \`${id}\`: *${from}* → *${to}*`)],
    };
  },

  "ticket.resolved": (data) => {
    const t = obj(data.ticket);
    const subject = (t.subject as string) ?? "(no subject)";
    return {
      text: `✅ Ticket resolved: ${subject}`,
      blocks: [
        header(`✅ Ticket resolved: ${subject}`),
        fields([
          ["Resolution", t.resolution_note],
          ["Resolved at", t.resolved_at],
        ]),
      ],
    };
  },

  "purchase.created": (data) => {
    const p = obj(data.purchase);
    const amount = money(p.amount);
    const product = (p.product as string) ?? "(unknown product)";
    return {
      text: `💰 Purchase: ${amount} ${product}`,
      blocks: [
        header(`💰 Purchase: ${amount}`),
        fields([
          ["Product", product],
          ["Contact", p.contact_id],
        ]),
      ],
    };
  },

  "relationship.status_changed": (data) => {
    const from = (data.from_status as string) ?? "?";
    const to = (data.to_status as string) ?? "?";
    const id = (data.relationship_id as string) ?? "(unknown)";
    return {
      text: `☕ Relationship: ${from} → ${to}`,
      blocks: [
        section(`☕ Relationship status: *${from}* → *${to}*`),
        fields([["Relationship", id]]),
      ],
    };
  },
};

export function transformForSlack(event: WebhookEvent, payload: WebhookPayload): SlackBody {
  const render = RENDERERS[event];
  if (!render) return { text: `Crema event: ${event}` };
  return render(obj(payload.data));
}
