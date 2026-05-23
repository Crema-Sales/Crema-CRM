import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getDB } from "@/db/env.server";
import { errorResponse, jsonResponse, optionsResponse, requireRestAuth } from "@/lib/api-v1";

const Payload = z.object({
  body: z.string().min(1).max(5000),
  subject: z.string().min(1).max(200).optional(),
});

// POST /api/v1/contacts/$id/notes — append a note activity. Mirrors the
// internal logActivity({ type: "note" }) path.
export const Route = createFileRoute("/api/v1/contacts/$id/notes")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResponse(),
      POST: async ({ request, params }) => {
        const r = await requireRestAuth(request);
        if (r.error) return r.error;
        const { ctx } = r;
        let parsed: z.infer<typeof Payload>;
        try {
          parsed = Payload.parse(await request.json());
        } catch (e: any) {
          return errorResponse(422, "validation_failed", String(e?.message ?? e));
        }
        const db = getDB();
        const contact = await db
          .prepare("SELECT id, org_id FROM contacts WHERE id = ? AND archived_at IS NULL")
          .bind(params.id)
          .first<{ id: string; org_id: string | null }>();
        if (!contact) return errorResponse(404, "not_found", "Contact not found");
        if (ctx.currentOrgId && contact.org_id && contact.org_id !== ctx.currentOrgId) {
          return errorResponse(403, "forbidden", "Contact belongs to a different org");
        }
        const id = crypto.randomUUID();
        const subject = parsed.subject ?? parsed.body.split("\n")[0].slice(0, 120);
        await db
          .prepare(
            `INSERT INTO activities (id, type, subject, body, contact_id, owner_id, org_id, occurred_at)
             VALUES (?, 'note', ?, ?, ?, ?, ?, datetime('now'))`,
          )
          .bind(id, subject, parsed.body, params.id, ctx.userId, contact.org_id)
          .run();
        return jsonResponse({ ok: true, activity_id: id }, { status: 201 });
      },
    },
  },
});
