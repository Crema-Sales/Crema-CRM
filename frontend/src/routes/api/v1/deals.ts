import { createFileRoute } from "@tanstack/react-router";
import { getDB } from "@/db/env.server";
import { isAdminOrManager } from "@/auth/middleware";
import { jsonResponse, optionsResponse, requireRestAuth } from "@/lib/api-v1";

// GET /api/v1/deals — rep-scoped deal list (matches the Kanban payload shape).
export const Route = createFileRoute("/api/v1/deals")({
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
          where.push("d.org_id = ?");
          params.push(ctx.currentOrgId);
        }
        if (!isAdminOrManager(ctx.role)) {
          where.push("d.owner_id = ?");
          params.push(ctx.userId);
        }
        const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

        const rows = (await getDB()
          .prepare(
            `SELECT d.*, co.name AS company_name, c.full_name AS contact_full_name
             FROM deals d
             LEFT JOIN companies co ON co.id = d.company_id
             LEFT JOIN contacts c ON c.id = d.contact_id
             ${whereSql}
             ORDER BY d.sort_order, d.created_at DESC
             LIMIT 200`,
          )
          .bind(...params)
          .all<any>()).results;

        return jsonResponse({
          items: rows.map((r: any) => ({
            id: r.id,
            name: r.name,
            stage: r.stage,
            value: Number(r.value || 0),
            probability: r.probability,
            company: r.company_id ? { id: r.company_id, name: r.company_name } : null,
            contact: r.contact_id ? { id: r.contact_id, full_name: r.contact_full_name } : null,
            owner_id: r.owner_id,
            expected_close: r.expected_close,
            closed_at: r.closed_at,
            created_at: r.created_at,
          })),
        });
      },
    },
  },
});
