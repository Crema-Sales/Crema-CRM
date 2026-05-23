import { createFileRoute } from "@tanstack/react-router";
import { getDB } from "@/db/env.server";
import { isAdminOrManager } from "@/auth/middleware";
import { jsonResponse, optionsResponse, requireRestAuth } from "@/lib/api-v1";

// GET /api/v1/tickets — tickets assigned to the caller (or all if admin).
// Includes SLA flags so the agent can prioritize without re-deriving them.
export const Route = createFileRoute("/api/v1/tickets")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResponse(),
      GET: async ({ request }) => {
        const r = await requireRestAuth(request);
        if (r.error) return r.error;
        const { ctx } = r;
        const params: unknown[] = [];
        const where: string[] = [];
        if (ctx.currentOrgId) {
          where.push("t.org_id = ?");
          params.push(ctx.currentOrgId);
        }
        if (!isAdminOrManager(ctx.role)) {
          where.push("t.assigned_to = ?");
          params.push(ctx.userId);
        }
        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        const rows = (await getDB()
          .prepare(
            `SELECT t.*, c.full_name AS contact_full_name, c.email AS contact_email
             FROM tickets t LEFT JOIN contacts c ON c.id = t.contact_id
             ${whereSql}
             ORDER BY t.created_at DESC
             LIMIT 200`,
          )
          .bind(...params)
          .all<any>()).results;

        const now = Date.now();
        return jsonResponse({
          items: rows.map((r: any) => ({
            id: r.id,
            subject: r.subject,
            description: r.description,
            status: r.status,
            priority: r.priority,
            sla_due_at: r.sla_due_at,
            sla_overdue: r.sla_due_at
              ? new Date(r.sla_due_at).getTime() < now && r.status !== "resolved" && r.status !== "closed"
              : false,
            assigned_to: r.assigned_to,
            created_at: r.created_at,
            contact: r.contact_id ? { id: r.contact_id, full_name: r.contact_full_name, email: r.contact_email } : null,
          })),
        });
      },
    },
  },
});
