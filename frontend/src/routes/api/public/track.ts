import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getDB, getEnv, getExecutionCtx } from "@/db/env.server";
import { getOrganizationByGuid } from "@/lib/orgs.server";
import { formAckKindForEvent, maybeSendFormAck } from "@/lib/email/form-acks";

const Payload = z.object({
  guid: z.string().min(1).max(200),
  anonymous_id: z.string().min(1).max(200),
  identity_email: z.string().email().max(200).nullable().optional(),
  identity_traits: z.unknown().nullable().optional(),
  event: z.string().min(1).max(120),
  url: z.string().max(2000).optional(),
  path: z.string().max(500).optional(),
  referrer: z.string().max(2000).nullable().optional(),
  title: z.string().max(500).nullable().optional(),
  props: z.unknown().nullable().optional(),
  occurred_at: z.string().datetime().optional(),
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

// One-way hash for the source IP so we can dedupe/rate-limit without storing
// raw IPs. Workers gives us a CF-Connecting-IP header for real clients.
async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null;
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(ip));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function findOrCreateContactByEmail(
  orgId: string,
  email: string,
  traits: Record<string, unknown> | null,
): Promise<string> {
  const db = getDB();
  // Use INSERT OR IGNORE + SELECT so that two concurrent identify/track posts
  // for the same email can't race their way into duplicate contact rows. The
  // (org_id, email) unique index in 0003 makes the IGNORE meaningful.
  const id = uuid();
  const nameFromTraits = traits && typeof traits === "object"
    ? (traits as Record<string, unknown>).full_name ?? (traits as Record<string, unknown>).name
    : undefined;
  const fullName = typeof nameFromTraits === "string" && nameFromTraits.trim().length > 0
    ? nameFromTraits
    : email.split("@")[0];
  await db
    .prepare(
      `INSERT OR IGNORE INTO contacts (id, full_name, email, org_id, relationship_stage)
       VALUES (?, ?, ?, ?, 'lead')`,
    )
    .bind(id, fullName, email, orgId)
    .run();
  const row = await db
    .prepare("SELECT id FROM contacts WHERE org_id = ? AND email = ?")
    .bind(orgId, email)
    .first<{ id: string }>();
  if (!row) throw new Error("Failed to upsert contact");
  return row.id;
}

export const Route = createFileRoute("/api/public/track")({
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
            JSON.stringify({ error: "invalid payload", detail: String((e as Error).message ?? e) }),
            { status: 400, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
          );
        }

        const org = await getOrganizationByGuid(parsed.guid);
        if (!org) {
          return new Response(JSON.stringify({ error: "unknown guid" }), {
            status: 404,
            headers: { ...corsHeaders(), "Content-Type": "application/json" },
          });
        }

        const db = getDB();
        const ipHash = await hashIp(
          request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for"),
        );

        // Resolve identity → contact_id (and adopt the anonymous trail).
        let contactId: string | null = null;
        const email = parsed.identity_email?.toLowerCase().trim() ?? null;
        const traits = (parsed.identity_traits ?? null) as Record<string, unknown> | null;
        if (email) {
          contactId = await findOrCreateContactByEmail(org.id, email, traits);
          // Backfill prior anonymous events for this anon_id to the resolved contact.
          await db
            .prepare(
              `UPDATE funnel_events
                  SET contact_id = ?
                WHERE org_id = ? AND anonymous_id = ? AND contact_id IS NULL`,
            )
            .bind(contactId, org.id, parsed.anonymous_id)
            .run();
        }

        const propsJson = parsed.props != null ? JSON.stringify(parsed.props) : null;
        await db
          .prepare(
            `INSERT INTO funnel_events
              (id, org_id, anonymous_id, contact_id, event_name, url, path, referrer, user_agent, ip_hash, props_json, occurred_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            uuid(),
            org.id,
            parsed.anonymous_id,
            contactId,
            parsed.event,
            parsed.url ?? null,
            parsed.path ?? null,
            parsed.referrer ?? null,
            request.headers.get("user-agent"),
            ipHash,
            propsJson,
            parsed.occurred_at ?? nowIso(),
          )
          .run();

        // Form-submit acknowledgment emails (mailing-list / demo-request).
        // Fires only when (a) the event maps to a kind, (b) we resolved an
        // email. Sent via ctx.waitUntil so the tracker response stays fast —
        // the snippet's perf budget matters for third-party sites embedding it.
        const ackKind = formAckKindForEvent(parsed.event);
        if (ackKind && email && contactId) {
          const fullNameFromTraits =
            traits && typeof traits === "object"
              ? (traits as Record<string, unknown>).full_name ??
                (traits as Record<string, unknown>).name
              : undefined;
          const companyFromTraits =
            traits && typeof traits === "object"
              ? (traits as Record<string, unknown>).company
              : undefined;
          const ackInput = {
            kind: ackKind,
            contactEmail: email,
            contactFullName:
              typeof fullNameFromTraits === "string" ? fullNameFromTraits : null,
            company: typeof companyFromTraits === "string" ? companyFromTraits : null,
            orgId: org.id,
            appBaseUrl: getEnv().APP_BASE_URL,
          };
          const ackPromise = maybeSendFormAck(ackInput).catch((e) =>
            console.error("form ack pipeline crashed", { kind: ackKind, e: String(e) }),
          );
          const execCtx = getExecutionCtx();
          if (execCtx) {
            execCtx.waitUntil(ackPromise);
          } else {
            // Local dev or any path without an ExecutionContext: await inline
            // so the dev server still observes the send.
            await ackPromise;
          }
        }

        return new Response(JSON.stringify({ ok: true, contact_id: contactId }), {
          status: 200,
          headers: { ...corsHeaders(), "Content-Type": "application/json" },
        });
      },
    },
  },
});
