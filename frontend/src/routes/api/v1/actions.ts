import { createFileRoute } from "@tanstack/react-router";
import { getDB } from "@/db/env.server";
import { jsonResponse, optionsResponse, requireRestAuth } from "@/lib/api-v1";

type Action =
  | { kind: "ticket"; id: string; subject: string; contact_id: string | null; sla_due_at: string | null; priority: string; score: number; verb: string }
  | { kind: "lead"; id: string; contact_id: string | null; subject: string; lead_score: number; score: number; verb: string }
  | { kind: "checkin"; id: string; contact_id: string; subject: string; days_since: number; score: number; verb: string };

// GET /api/v1/actions — the prioritized action queue, same logic the UI's
// /today page will surface. Blends ticket urgency, lead score, and customer
// check-in staleness into a single ranked list. Scoped to the calling rep.
export const Route = createFileRoute("/api/v1/actions")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResponse(),
      GET: async ({ request }) => {
        const r = await requireRestAuth(request);
        if (r.error) return r.error;
        const { ctx } = r;
        const db = getDB();
        const orgId = ctx.currentOrgId ?? null;

        const [tickets, leads, checkins] = await Promise.all([
          db.prepare(
            `SELECT t.id, t.subject, t.contact_id, t.sla_due_at, t.priority
             FROM tickets t
             WHERE t.assigned_to = ? AND t.status IN ('open','pending')
               AND (? IS NULL OR t.org_id = ?)`,
          ).bind(ctx.userId, orgId, orgId).all<{
            id: string; subject: string; contact_id: string | null;
            sla_due_at: string | null; priority: string;
          }>(),
          db.prepare(
            `SELECT l.id, l.contact_id, l.score AS lead_score, c.full_name, c.is_ideal_customer
             FROM leads l JOIN contacts c ON c.id = l.contact_id
             WHERE l.owner_id = ? AND l.status IN ('new','contacted','qualified')
               AND (? IS NULL OR l.org_id = ?)`,
          ).bind(ctx.userId, orgId, orgId).all<{
            id: string; contact_id: string; lead_score: number;
            full_name: string; is_ideal_customer: number;
          }>(),
          db.prepare(
            `SELECT c.id, c.full_name,
                    (SELECT MAX(occurred_at) FROM activities WHERE contact_id = c.id) AS last_at
             FROM contacts c
             WHERE c.owner_id = ? AND c.relationship_stage = 'customer'
               AND c.archived_at IS NULL
               AND (? IS NULL OR c.org_id = ?)`,
          ).bind(ctx.userId, orgId, orgId).all<{
            id: string; full_name: string; last_at: string | null;
          }>(),
        ]);

        const now = Date.now();
        const items: Action[] = [];

        for (const t of tickets.results) {
          const overdue = t.sla_due_at ? new Date(t.sla_due_at).getTime() < now : false;
          const prio = t.priority === "urgent" ? 40 : t.priority === "high" ? 25 : t.priority === "medium" ? 10 : 0;
          items.push({
            kind: "ticket",
            id: t.id,
            subject: t.subject,
            contact_id: t.contact_id,
            sla_due_at: t.sla_due_at,
            priority: t.priority,
            score: (overdue ? 100 : 60) + prio,
            verb: overdue ? "Reply (SLA overdue)" : "Reply",
          });
        }
        for (const l of leads.results) {
          const ideal = l.is_ideal_customer ? 25 : 0;
          items.push({
            kind: "lead",
            id: l.id,
            contact_id: l.contact_id,
            subject: l.full_name,
            lead_score: l.lead_score,
            score: Number(l.lead_score ?? 0) + ideal,
            verb: "Reach out",
          });
        }
        for (const c of checkins.results) {
          const days = c.last_at
            ? Math.floor((now - new Date(c.last_at).getTime()) / 86400000)
            : 60;
          items.push({
            kind: "checkin",
            id: c.id,
            contact_id: c.id,
            subject: c.full_name,
            days_since: days,
            score: Math.max(0, days - 7),
            verb: "Check in",
          });
        }

        items.sort((a, b) => b.score - a.score);
        return jsonResponse({ items: items.slice(0, 20) });
      },
    },
  },
});
