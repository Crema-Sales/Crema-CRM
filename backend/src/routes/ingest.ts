// Cross-property ingest. The "paste-a-curl, watch the activity appear in
// two seconds" beat. HMAC-authed (no rep JWT here — partners can't sign
// arbitrary user tokens), routes through identity resolution, lands as an
// activity row, fans out via the customer SSE topic from Phase 09.
//
// Wire shape:
//   POST /v1/ingest
//     headers: Authorization: HMAC <source>:<base64(hmac_sha256(body, key))>
//     body: { type: "track"|"identify"|"page", event?, identity, properties, source }
//   GET /v1/pixel?email=…&campaign=…
//     returns a 1×1 transparent GIF, logs an email-open activity

import { OpenAPIHono, z } from "@hono/zod-openapi";
import * as db from "../db";
import { resolveOrCreateCustomer } from "../identity";
import type { Env } from "../index";
import { errorBody } from "./_util";

type AppEnv = { Bindings: Env };

const IngestIdentity = z
  .object({
    anonymousId: z.string().optional(),
    email: z.email().optional(),
    userId: z.string().optional(),
  })
  .refine((v) => Boolean(v.anonymousId || v.email || v.userId), {
    message: "at least one of anonymousId/email/userId is required",
  });

const IngestEvent = z
  .object({
    type: z.enum(["track", "identify", "page"]),
    event: z.string().optional(),
    identity: IngestIdentity,
    properties: z.record(z.string(), z.unknown()).default({}),
    timestamp: z.iso.datetime().optional(),
    source: z.string().min(1),
  })
  .openapi("IngestEvent");

const PixelQuery = z.object({
  email: z.email(),
  campaign: z.string().optional(),
  source: z.string().optional(),
});

// ─── HMAC helpers ───────────────────────────────────────────────────────────

function parseAuthHeader(value: string | null): { source: string; mac: string } | null {
  if (!value) return null;
  const m = value.match(/^HMAC\s+([^:]+):(.+)$/);
  if (!m) return null;
  return { source: m[1].trim(), mac: m[2].trim() };
}

function loadKeys(env: Env): Record<string, string> {
  if (!env.INGEST_HMAC_KEYS) return {};
  try {
    return JSON.parse(env.INGEST_HMAC_KEYS) as Record<string, string>;
  } catch {
    return {};
  }
}

async function hmacSha256Base64(rawKey: string, body: ArrayBuffer): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(rawKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, body);
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyIngestHmac(
  env: Env,
  authHeader: string | null,
  rawBody: ArrayBuffer,
): Promise<{ source: string } | null> {
  // Dev-only wildcard for paste-on-camera demos. Gated to ENVIRONMENT=dev.
  if (env.ENVIRONMENT === "dev" && authHeader === "HMAC dev:dev") {
    return { source: "dev" };
  }
  const parsed = parseAuthHeader(authHeader);
  if (!parsed) return null;
  const keys = loadKeys(env);
  const key = keys[parsed.source];
  if (!key) return null;
  const expected = await hmacSha256Base64(key, rawBody);
  if (!constantTimeEq(expected, parsed.mac)) return null;
  return { source: parsed.source };
}

// ─── 1×1 transparent GIF ────────────────────────────────────────────────────

const PIXEL_GIF_BYTES = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
  0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
  0x44, 0x01, 0x00, 0x3b,
]);

// ─── Routes ─────────────────────────────────────────────────────────────────

export const ingestRoutes = new OpenAPIHono<AppEnv>();

// We use a plain post() instead of openapi(createRoute(...)) so the raw body
// is available for HMAC verification BEFORE any validator reads it. The
// OpenAPI body schema is unused; the response schema below still gets typed.
ingestRoutes.post("/v1/ingest", async (c) => {
  const rawBody = await c.req.raw.arrayBuffer();
  const auth = await verifyIngestHmac(
    c.env,
    c.req.header("Authorization") ?? c.req.header("authorization") ?? null,
    rawBody,
  );
  if (!auth) {
    return c.json(errorBody("unauthorized", "missing or invalid HMAC"), 401);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return c.json(errorBody("validation_failed", "body is not valid JSON"), 422);
  }
  const result = IngestEvent.safeParse(parsed);
  if (!result.success) {
    return c.json(
      errorBody("validation_failed", result.error.issues.map((i) => i.message).join("; ")),
      422,
    );
  }
  const body = result.data;
  if (body.type === "track" && !body.event) {
    return c.json(errorBody("validation_failed", "track events require an `event` name"), 422);
  }

  const { customerId, resolved } = await resolveOrCreateCustomer(c.env, body.identity);

  const summary =
    body.type === "identify"
      ? `identified via ${body.source}`
      : body.type === "page"
        ? `page: ${String(body.properties.path ?? "/")}`
        : `${body.event}: ${JSON.stringify(body.properties)}`;

  const activity = await db.appendActivity(c.env, {
    customerId,
    type: body.type === "page" ? "page_view" : "ingest",
    body: summary.slice(0, 500),
    source: "ingest",
    actorId: `ingest_${body.source}`,
  });

  return c.json({ ok: true as const, activityId: activity.id, customerId, resolved }, 201);
});

ingestRoutes.get("/v1/pixel", async (c) => {
  const q = PixelQuery.safeParse({
    email: c.req.query("email"),
    campaign: c.req.query("campaign"),
    source: c.req.query("source"),
  });
  if (!q.success) {
    return c.json(errorBody("validation_failed", "email query required"), 422);
  }
  try {
    const { customerId } = await resolveOrCreateCustomer(c.env, { email: q.data.email });
    await db.appendActivity(c.env, {
      customerId,
      type: "email",
      body: `opened email (campaign=${q.data.campaign ?? "unknown"})`,
      source: "ingest",
      actorId: `ingest_pixel${q.data.source ? `_${q.data.source}` : ""}`,
    });
  } catch (err) {
    console.log(`[pixel] ingest failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return new Response(PIXEL_GIF_BYTES, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL_GIF_BYTES.byteLength),
      "Cache-Control": "no-store",
    },
  });
});
