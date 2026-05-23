import { createFileRoute } from "@tanstack/react-router";
import { getDB } from "@/db/env.server";
import { isAdminOrManager } from "@/auth/middleware";
import { jsonResponse, optionsResponse, requireRestAuth } from "@/lib/api-v1";

// GET /api/v1/contacts[?assigned_to_me=true] — caller's contacts. Admins see
// the whole org by default; reps always see only their own.
export const Route = createFileRoute("/api/v1/contacts")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResponse(),
      GET: async ({ request }) => {
        const r = await requireRestAuth(request);
        if (r.error) return r.error;
        const { ctx } = r;
        const url = new URL(request.url);
        const assignedOnly = url.searchParams.get("assigned_to_me") === "true";
        const forceOwner = !isAdminOrManager(ctx.role) || assignedOnly;

        const params: unknown[] = [];
        const where: string[] = ["c.archived_at IS NULL"];
        if (ctx.currentOrgId) {
          where.push("c.org_id = ?");
          params.push(ctx.currentOrgId);
        }
        if (forceOwner) {
          where.push("c.owner_id = ?");
          params.push(ctx.userId);
        }

        const rows = (await getDB()
          .prepare(
            `SELECT c.id, c.full_name, c.email, c.phone, c.title, c.relationship_stage,
                    c.is_ideal_customer, c.stage_entered_at, c.created_at,
                    co.id AS company_id, co.name AS company_name
             FROM contacts c LEFT JOIN companies co ON co.id = c.company_id
             WHERE ${where.join(" AND ")}
             ORDER BY c.created_at DESC
             LIMIT 200`,
          )
          .bind(...params)
          .all<any>()).results;

        return jsonResponse({
          items: rows.map((r: any) => ({
            id: r.id,
            full_name: r.full_name,
            email: r.email,
            phone: r.phone,
            title: r.title,
            relationship_stage: r.relationship_stage,
            is_ideal_customer: Boolean(r.is_ideal_customer),
            stage_entered_at: r.stage_entered_at,
            created_at: r.created_at,
            company: r.company_id ? { id: r.company_id, name: r.company_name } : null,
          })),
        });
      },
    },
  },
});
