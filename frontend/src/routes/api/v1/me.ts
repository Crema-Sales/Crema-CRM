import { createFileRoute } from "@tanstack/react-router";
import { getDB } from "@/db/env.server";
import { errorResponse, jsonResponse, optionsResponse, requireRestAuth } from "@/lib/api-v1";

// GET /api/v1/me — bearer-authed identity + org probe for the agent worker.
// Same shape as crm.functions.ts:getMe so a tool consumer can rely on either.
export const Route = createFileRoute("/api/v1/me")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResponse(),
      GET: async ({ request }) => {
        const r = await requireRestAuth(request);
        if (r.error) return r.error;
        const { ctx } = r;
        const user = await getDB()
          .prepare(
            "SELECT id, email, full_name, avatar_url, title, role, sales_methodology FROM users WHERE id = ?",
          )
          .bind(ctx.userId)
          .first<{
            id: string;
            email: string;
            full_name: string | null;
            avatar_url: string | null;
            title: string | null;
            role: string;
            sales_methodology: string | null;
          }>();
        if (!user) return errorResponse(404, "not_found", "User row missing");
        return jsonResponse({
          profile: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
            title: user.title,
            sales_methodology: user.sales_methodology,
          },
          roles: [user.role],
          userId: ctx.userId,
          currentOrgId: ctx.currentOrgId,
        });
      },
    },
  },
});
