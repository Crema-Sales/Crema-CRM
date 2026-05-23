import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getDB } from "@/db/env.server";
import { getOrganizationByGuid } from "@/lib/orgs.server";
import { verifyCremaEid } from "@/lib/tracking-signature";

// Public endpoint for verified auto-identify. The snippet calls this when it
// finds `?crema_eid=<token>` in the URL of a tracked page. Token is HMAC-signed
// by the customer using their org tracking_secret, so we can trust the email
// without inviting drive-by pipeline pollution from forged campaign URLs.
//
// On success we mirror the identify-side effects of /api/public/track:
//   1. find-or-create the contact by email
//   2. backfill prior anonymous funnel_events for this anon_id to the contact
//   3. record an `identify` funnel_event so the journey shows where the
//      conversion came from

const Payload = z.object({
  guid: z.string().min(1).max(200),
  anonymous_id: z.string().min(1).max(200),
  crema_eid: z.string().min(3).max(1000),
  url: z.string().max(2000).optional(),
  path: z.string().max(500).optional(),
  referrer: z.string().max(2000).nullable().optional(),
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function uuid() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

export const Route = createFileRoute("/api/public/identify")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),
      POST: async ({ request }) => {
        const raw = await request.text();
        let parsed: z.infer<typeof Payload>;
        try {
          parsed = Payload.parse(JSON.parse(raw));
        } catch (e) {
          return new Response(
            JSON.stringify({ verified: false, error: "invalid payload", detail: String((e as Error).message ?? e) }),
            { status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
          );
        }

        const org = await getOrganizationByGuid(parsed.guid);
        if (!org) {
          return new Response(JSON.stringify({ verified: false, error: "unknown guid" }), {
            status: 404,
            headers: { ...corsHeaders(), "Content-Type": "application/json" },
          });
        }

        const verified = await verifyCremaEid(parsed.crema_eid, org.tracking_secret);
        if (!verified) {
          // 200 with verified:false rather than 401 — snippet uses sendBeacon as a
          // fallback path and we don't want a noisy console error for what is
          // effectively "this URL was tampered with, ignore."
          return new Response(JSON.stringify({ verified: false, error: "invalid signature" }), {
            status: 200,
            headers: { ...corsHeaders(), "Content-Type": "application/json" },
          });
        }

        const email = verified.email;
        const db = getDB();

        // INSERT OR IGNORE + SELECT — same idempotent upsert as /api/public/track
        // so the two paths can't race their way into duplicate contact rows.
        const contactId = uuid();
        const fallbackName = email.split("@")[0];
        await db
          .prepare(
            `INSERT OR IGNORE INTO contacts (id, full_name, email, org_id, relationship_stage)
             VALUES (?, ?, ?, ?, 'lead')`,
          )
          .bind(contactId, fallbackName, email, org.id)
          .run();
        const row = await db
          .prepare("SELECT id FROM contacts WHERE org_id = ? AND email = ?")
          .bind(org.id, email)
          .first<{ id: string }>();
        if (!row) {
          return new Response(JSON.stringify({ verified: false, error: "upsert failed" }), {
            status: 500,
            headers: { ...corsHeaders(), "Content-Type": "application/json" },
          });
        }
        const resolvedContactId = row.id;

        // Adopt the pre-identification anonymous trail.
        await db
          .prepare(
            `UPDATE funnel_events
                SET contact_id = ?
              WHERE org_id = ? AND anonymous_id = ? AND contact_id IS NULL`,
          )
          .bind(resolvedContactId, org.id, parsed.anonymous_id)
          .run();

        // Stamp the moment of verified identification.
        await db
          .prepare(
            `INSERT INTO funnel_events
              (id, org_id, anonymous_id, contact_id, event_name, url, path, referrer, user_agent, ip_hash, props_json, occurred_at)
             VALUES (?, ?, ?, ?, 'identify', ?, ?, ?, ?, NULL, ?, ?)`,
          )
          .bind(
            uuid(),
            org.id,
            parsed.anonymous_id,
            resolvedContactId,
            parsed.url ?? null,
            parsed.path ?? null,
            parsed.referrer ?? null,
            request.headers.get("user-agent"),
            JSON.stringify({ source: "crema_eid" }),
            nowIso(),
          )
          .run();

        return new Response(
          JSON.stringify({ verified: true, email, contact_id: resolvedContactId }),
          {
            status: 200,
            headers: { ...corsHeaders(), "Content-Type": "application/json" },
          },
        );
      },
    },
  },
});
