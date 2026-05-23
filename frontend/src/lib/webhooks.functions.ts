// Server-fns for webhook subscriptions + delivery log + send-test.
// The settings UI (Phase 04) calls these via TanStack's serverFn transport.
// Auth: requireAuth gives us userId/role; the active org_id lives on the JWT
// payload's current_org_id, so we re-read the cookie via currentOrgId().
// See Webhooks/DESIGN.md → Auth & access control, Wire format, Event catalog.
// TODO Phase 04: smoke via UI — a standalone curl-style script is impractical
// because TanStack mints serverFn URLs (`/_serverFn/<compiler-generated-id>`)
// at build time and there's no public manifest to enumerate them from the
// outside. The Settings UI exercises every fn end-to-end, so we cover the
// smoke there.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireAuth } from "@/auth/middleware";
import { authPayloadFromCookieHeader } from "@/auth/cookies.server";
import { getDB } from "@/db/env.server";
import { deliverOnce } from "@/lib/webhooks/deliver";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/lib/webhooks/events";
import { secretFingerprint } from "@/lib/webhooks/signing";
import {
  countSubscriptions,
  createSubscription,
  deleteSubscription,
  getSubscription,
  listRecentDeliveries,
  listSubscriptions,
  regenerateSecret,
  updateSubscription,
  type WebhookSubscriptionRow,
} from "@/lib/webhooks/subscriptions.server";
import { buildTestPayload } from "@/lib/webhooks/test-payloads";
import type { WebhookPayload } from "@/lib/webhooks/types";

// requireAuth's context doesn't surface current_org_id (only userId/email/role)
// — re-read the cookie payload here. Mirrors org-fns.ts requireSession() but
// only returns the org id; the userId comes from middleware context.
async function currentOrgId(): Promise<string> {
  const req = getRequest();
  const payload = await authPayloadFromCookieHeader(req?.headers?.get("cookie"));
  if (!payload?.current_org_id) throw new Error("No active organization");
  return payload.current_org_id;
}

async function redactSecret(
  row: WebhookSubscriptionRow,
): Promise<Omit<WebhookSubscriptionRow, "secret"> & { secret_fingerprint: string }> {
  const { secret, ...rest } = row;
  return { ...rest, secret_fingerprint: await secretFingerprint(secret) };
}

// Allow https:// always; allow http:// only for the standard dev/test targets
// (localhost, 127.0.0.1, webhook.site). Anything else gets rejected at the
// validator so we never persist a plain-http production URL by accident.
const HTTP_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "webhook.site"];
const webhookUrl = z
  .string()
  .url()
  .refine(
    (value) => {
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        return false;
      }
      if (parsed.protocol === "https:") return true;
      if (parsed.protocol !== "http:") return false;
      return HTTP_ALLOWED_HOSTS.some(
        (host) => parsed.hostname === host || parsed.hostname.startsWith(`${host}.`),
      );
    },
    {
      message: "URL must be https://, or http://localhost / 127.0.0.1 / webhook.site for testing",
    },
  );

const webhookEventSchema = z.enum(WEBHOOK_EVENTS as readonly [string, ...string[]]);

export const listWebhooks = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const orgId = await currentOrgId();
    const rows = await listSubscriptions(orgId);
    return await Promise.all(rows.map(redactSecret));
  });

export const createWebhook = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (d: { name: string; url: string; events: WebhookEvent[]; format: "json" | "slack" }) =>
      z
        .object({
          name: z.string().min(1).max(80),
          url: webhookUrl,
          events: z.array(webhookEventSchema).min(1),
          format: z.enum(["json", "slack"]),
        })
        .parse(d),
  )
  .handler(async ({ context, data }) => {
    const orgId = await currentOrgId();
    // Hard cap to prevent runaway accidental creation in the demo. Not a real
    // quota — revisit after Phase 04 testing if 20 turns out tight.
    const existingCount = await countSubscriptions(orgId);
    if (existingCount >= 20) {
      throw new Error(
        "Webhook limit reached (20). Delete an existing subscription before creating another.",
      );
    }
    const row = await createSubscription({
      org_id: orgId,
      name: data.name,
      url: data.url,
      events: data.events as WebhookEvent[],
      format: data.format,
      created_by: context.userId,
    });
    return { subscription: await redactSecret(row), secret: row.secret };
  });

export const updateWebhook = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (d: {
      id: string;
      name?: string;
      url?: string;
      events?: WebhookEvent[];
      format?: "json" | "slack";
      enabled?: boolean;
    }) =>
      z
        .object({
          id: z.string().min(1),
          name: z.string().min(1).max(80).optional(),
          url: webhookUrl.optional(),
          events: z.array(webhookEventSchema).min(1).optional(),
          format: z.enum(["json", "slack"]).optional(),
          enabled: z.boolean().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    const orgId = await currentOrgId();
    const existing = await getSubscription(data.id, orgId);
    if (!existing) throw new Error("Webhook subscription not found");
    const updated = await updateSubscription(data.id, orgId, {
      name: data.name,
      url: data.url,
      events: data.events as WebhookEvent[] | undefined,
      format: data.format,
      enabled: data.enabled,
    });
    return await redactSecret(updated);
  });

export const regenerateWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const orgId = await currentOrgId();
    const existing = await getSubscription(data.id, orgId);
    if (!existing) throw new Error("Webhook subscription not found");
    return await regenerateSecret(data.id, orgId);
  });

export const revealWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const orgId = await currentOrgId();
    const row = await getSubscription(data.id, orgId);
    if (!row) throw new Error("Webhook subscription not found");
    return { id: row.id, secret: row.secret };
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const orgId = await currentOrgId();
    const existing = await getSubscription(data.id, orgId);
    if (!existing) throw new Error("Webhook subscription not found");
    await deleteSubscription(data.id, orgId);
    return { ok: true as const };
  });

export const listWebhookDeliveries = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: { subscription_id?: string; limit?: number } | undefined) =>
    z
      .object({
        subscription_id: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const orgId = await currentOrgId();
    return await listRecentDeliveries(orgId, {
      subscription_id: data.subscription_id,
      limit: data.limit,
    });
  });

export const sendTestWebhook = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string; event?: WebhookEvent }) =>
    z
      .object({
        id: z.string().min(1),
        event: webhookEventSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const orgId = await currentOrgId();
    const subscription = await getSubscription(data.id, orgId);
    if (!subscription) throw new Error("Webhook subscription not found");
    const event = (data.event ?? "deal.won") as WebhookEvent;
    const payload: WebhookPayload = {
      id: crypto.randomUUID(),
      event,
      org_id: orgId,
      occurred_at: new Date().toISOString(),
      data: buildTestPayload(event),
    };
    // Awaited on purpose: the user clicked "Send test" and is waiting for the
    // delivery result. Every other emit() site fires-and-forgets via waitUntil.
    await deliverOnce({ subscription, event, payload });
    const inserted = await getDB()
      .prepare(
        `SELECT id FROM webhook_deliveries
          WHERE subscription_id = ?
          ORDER BY attempted_at DESC
          LIMIT 1`,
      )
      .bind(subscription.id)
      .first<{ id: string }>();
    if (!inserted) throw new Error("Test delivery did not produce a log row");
    return { ok: true as const, delivery_id: inserted.id };
  });
