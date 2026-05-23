import { createFileRoute } from "@tanstack/react-router";
import { getDB } from "@/db/env.server";
import { errorResponse, jsonResponse, optionsResponse, requireRestAuth } from "@/lib/api-v1";

// GET /api/v1/contacts/$id — contact detail with timeline + purchases + deals,
// same payload shape crm.functions.ts:getContact returns to the UI.
export const Route = createFileRoute("/api/v1/contacts/$id")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResponse(),
      GET: async ({ request, params }) => {
        const r = await requireRestAuth(request);
        if (r.error) return r.error;
        const { ctx } = r;
        const id = params.id;
        const db = getDB();

        const contactRow = await db
          .prepare(
            `SELECT c.*, co.id AS co_id, co.name AS co_name, co.domain AS co_domain,
                    co.industry AS co_industry, co.employee_count AS co_employees
             FROM contacts c LEFT JOIN companies co ON co.id = c.company_id
             WHERE c.id = ?`,
          )
          .bind(id)
          .first<any>();

        if (!contactRow) return errorResponse(404, "not_found", "Contact not found");
        // Cross-org access guard. Admins of one org cannot peek into another's row.
        if (ctx.currentOrgId && contactRow.org_id && contactRow.org_id !== ctx.currentOrgId) {
          return errorResponse(403, "forbidden", "Contact belongs to a different org");
        }

        const [activities, purchases, deals] = await Promise.all([
          db.prepare(`SELECT * FROM activities WHERE contact_id = ? ORDER BY occurred_at DESC LIMIT 100`).bind(id).all<any>(),
          db.prepare(`SELECT * FROM purchases WHERE contact_id = ? ORDER BY occurred_at DESC`).bind(id).all<any>(),
          db.prepare(`SELECT * FROM deals WHERE contact_id = ?`).bind(id).all<any>(),
        ]);
        const ltv = purchases.results.reduce((s: number, p: any) => s + Number(p.amount), 0);

        return jsonResponse({
          contact: {
            ...contactRow,
            is_ideal_customer: Boolean(contactRow.is_ideal_customer),
            company: contactRow.co_id
              ? {
                  id: contactRow.co_id,
                  name: contactRow.co_name,
                  domain: contactRow.co_domain,
                  industry: contactRow.co_industry,
                  employee_count: contactRow.co_employees,
                }
              : null,
          },
          activities: activities.results,
          purchases: purchases.results,
          deals: deals.results,
          ltv,
        });
      },
    },
  },
});
