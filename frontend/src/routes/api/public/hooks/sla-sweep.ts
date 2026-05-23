import { createFileRoute } from "@tanstack/react-router";
import { getDB, getEnv } from "@/db/env.server";

function uuid() { return crypto.randomUUID(); }
function nowIso() { return new Date().toISOString(); }

function escalate(p: "low"|"medium"|"high"|"urgent"): "low"|"medium"|"high"|"urgent" {
  return p === "low" ? "medium" : p === "medium" ? "high" : "urgent";
}

export const Route = createFileRoute("/api/public/hooks/sla-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/, "");
        if (!provided || provided !== getEnv().INGEST_WEBHOOK_SECRET) {
          return new Response("Unauthorized", { status: 401 });
        }
        const db = getDB();
        const nowTs = nowIso();
        const twelveHoursAgo = new Date(Date.now() - 12 * 3600_000).toISOString();
        const breached = (await db.prepare(
          `SELECT id, priority, subject FROM tickets
           WHERE sla_due_at < ? AND status IN ('open','pending')
             AND (last_escalated_at IS NULL OR last_escalated_at < ?)`,
        ).bind(nowTs, twelveHoursAgo).all<{ id: string; priority: "low"|"medium"|"high"|"urgent"; subject: string }>()).results;

        const escalated: { id: string; priority: string }[] = [];
        for (const t of breached) {
          const next = escalate(t.priority);
          await db.prepare(`UPDATE tickets SET priority = ?, last_escalated_at = ? WHERE id = ?`).bind(next, nowTs, t.id).run();
          await db.prepare(
            `INSERT INTO ticket_comments (id, ticket_id, body, is_internal) VALUES (?, ?, ?, 1)`,
          ).bind(uuid(), t.id, `SLA breached — auto-escalated from ${t.priority} to ${next}.`).run();
          await db.prepare(
            `INSERT INTO activities (id, type, subject, body) VALUES (?, 'signal', ?, ?)`,
          ).bind(uuid(), "Ticket SLA breached", `Ticket "${t.subject}" escalated to ${next}.`).run();
          escalated.push({ id: t.id, priority: next });
        }
        return new Response(JSON.stringify({ ok: true, escalated }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
