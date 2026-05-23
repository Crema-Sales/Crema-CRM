import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getDB, getEnv } from "@/db/env.server";
import { emitWebhookEvent } from "@/lib/webhooks/emit";

const Payload = z.object({
  event: z.enum(["pageview", "purchase", "support_request", "signup", "email_open", "custom"]),
  contact: z.object({
    email: z.string().email(),
    full_name: z.string().min(1).max(200).optional(),
    company_domain: z.string().max(200).optional(),
  }),
  subject: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  amount: z.number().nonnegative().optional(),
  product: z.string().max(200).optional(),
  occurred_at: z.string().datetime().optional(),
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-signature",
  };
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function uuid() { return crypto.randomUUID(); }
function nowIso() { return new Date().toISOString(); }

function slaDueAt(priority: "low"|"medium"|"high"|"urgent"): string {
  const hours = priority === "urgent" ? 4 : priority === "high" ? 24 : priority === "low" ? 24 * 7 : 72;
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

export const Route = createFileRoute("/api/public/ingest")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),
      POST: async ({ request }) => {
        const body = await request.text();
        const secret = getEnv().INGEST_WEBHOOK_SECRET;
        if (secret) {
          const sig = request.headers.get("x-signature") ?? "";
          const expected = await hmacHex(secret, body);
          if (!timingSafeEqHex(sig, expected)) {
            return new Response("invalid signature", { status: 401, headers: corsHeaders() });
          }
        }

        let parsed: z.infer<typeof Payload>;
        try {
          parsed = Payload.parse(JSON.parse(body));
        } catch (e: any) {
          return new Response(JSON.stringify({ error: "invalid payload", detail: String(e?.message ?? e) }), {
            status: 400,
            headers: { ...corsHeaders(), "Content-Type": "application/json" },
          });
        }

        const db = getDB();

        // Find or insert company by domain
        let companyId: string | null = null;
        if (parsed.contact.company_domain) {
          const co = await db.prepare("SELECT id FROM companies WHERE domain = ?").bind(parsed.contact.company_domain).first<{ id: string }>();
          if (co) companyId = co.id;
          else {
            companyId = uuid();
            await db.prepare(
              `INSERT INTO companies (id, name, domain) VALUES (?, ?, ?)`,
            ).bind(companyId, parsed.contact.company_domain, parsed.contact.company_domain).run();
          }
        }

        // Find or insert contact by email
        const existing = await db.prepare(
          "SELECT id, owner_id FROM contacts WHERE email = ?",
        ).bind(parsed.contact.email).first<{ id: string; owner_id: string | null }>();
        let contactId: string;
        let ownerId: string | null = existing?.owner_id ?? null;
        if (existing) {
          contactId = existing.id;
          if (companyId) {
            await db.prepare("UPDATE contacts SET company_id = ? WHERE id = ?").bind(companyId, contactId).run();
          }
        } else {
          const anyAdmin = await db.prepare(
            "SELECT id FROM users WHERE role IN ('admin','manager') ORDER BY created_at LIMIT 1",
          ).first<{ id: string }>();
          ownerId = anyAdmin?.id ?? (await db.prepare("SELECT id FROM users ORDER BY created_at LIMIT 1").first<{ id: string }>())?.id ?? null;
          contactId = uuid();
          await db.prepare(
            `INSERT INTO contacts (id, email, full_name, company_id, owner_id) VALUES (?, ?, ?, ?, ?)`,
          ).bind(
            contactId,
            parsed.contact.email,
            parsed.contact.full_name ?? parsed.contact.email.split("@")[0],
            companyId,
            ownerId,
          ).run();
        }

        const activityType =
          parsed.event === "purchase" ? "system" :
          parsed.event === "support_request" ? "system" :
          parsed.event === "email_open" ? "email" :
          "signal";
        await db.prepare(
          `INSERT INTO activities (id, type, subject, body, contact_id, owner_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(uuid(), activityType, parsed.subject, parsed.body ?? null, contactId, ownerId, parsed.occurred_at ?? nowIso()).run();

        if (parsed.event === "purchase" && parsed.amount) {
          const purchaseId = uuid();
          await db.prepare(
            `INSERT INTO purchases (id, contact_id, amount, product) VALUES (?, ?, ?, ?)`,
          ).bind(purchaseId, contactId, parsed.amount, parsed.product ?? "Purchase").run();
          // ingest.ts does not resolve a tracking-guid → org_id yet, so the
          // inserted row's org_id is NULL and emitWebhookEvent no-ops. When
          // that resolution lands, this emit will start firing automatically.
          const row = await db
            .prepare("SELECT * FROM purchases WHERE id = ?")
            .bind(purchaseId)
            .first<{ org_id: string | null } & Record<string, unknown>>();
          if (row?.org_id) {
            emitWebhookEvent(row.org_id, "purchase.created", {
              purchase: row,
              contact_id: contactId,
            });
          }
        }
        if (parsed.event === "support_request") {
          await db.prepare(
            `INSERT INTO tickets (id, subject, description, contact_id, assigned_to, status, priority, sla_due_at)
             VALUES (?, ?, ?, ?, ?, 'open', 'medium', ?)`,
          ).bind(uuid(), parsed.subject, parsed.body ?? null, contactId, ownerId, slaDueAt("medium")).run();
        }

        return new Response(JSON.stringify({ ok: true, contact_id: contactId }), {
          status: 200,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        });
      },
    },
  },
});
