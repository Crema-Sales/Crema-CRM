import { DurableObject } from "cloudflare:workers";
import type { ActivityType } from "@crema/shared";
import * as db from "./db";
import { resolveExistingCustomerByEmail, resolveOrCreateCustomer } from "./identity";
import type { Env } from "./index";

// RepExtension — per-rep Durable Object that brokers the extension WS.
//
// One instance per `idFromName(repId)`. Owns the hibernating WebSocket dialed
// outbound by the rep's MV3 service worker, persists a FIFO command queue
// while offline (24h TTL), and dispatches commands from
// `POST /agents/:repId/act` to the live socket — falling through to the queue
// if no socket is currently connected.
//
// Pairs with `RepAgent` (chat copilot) which is keyed the same way. Both
// surfaces address the same rep; they just live in different DO classes so
// the extension WS lifecycle doesn't have to interleave with `AIChatAgent`'s
// internal WebSocket bookkeeping.
//
// Wire contract: `shared/agent-ws-protocol.md`.

type Pending = {
  resolve: (result: unknown) => void;
  reject: (err: { error: string }) => void;
  timer: ReturnType<typeof setTimeout>;
};

type Queued = {
  id: string;
  type: string;
  params: unknown;
  queuedAt: number;
};

// Slightly above the extension's own 30s `navigate` page-load wait so the DO
// doesn't time out a command that's about to succeed.
const ACT_TIMEOUT_MS = 35_000;
const QUEUE_TTL_MS = 24 * 60 * 60 * 1000;
const QUEUE_KEY = "queue";
const ENABLED_KEY = "enabled";
const REP_ID_KEY = "repId";
const ACTIVITY_SEEN_KEY = "activitySeen";

// One ambient-capture event from the extension's content-script adapters.
// Spec: shared/agent-ws-protocol.md v0.2 § "Activity events".
type ActivityEvent = {
  kind: string;
  site?: string;
  occurredAt?: number;
  contact?: { email?: string; name?: string; profileUrl?: string };
  subject?: string;
  preview?: string;
  url?: string;
  dedupeKey?: string;
};

// Maps an extension activity `kind` onto a CRM activity row. The schema's
// ActivityType enum has no linkedin/teams members, so social touches land as
// `note`; email stays `email` so the timeline renders it as mail.
const ACTIVITY_MAP: Record<string, { type: ActivityType; label: string }> = {
  email_sent: { type: "email", label: "Sent email" },
  email_received: { type: "email", label: "Received email" },
  linkedin_comment: { type: "note", label: "Commented on LinkedIn" },
  linkedin_message: { type: "note", label: "Sent a LinkedIn message" },
  teams_message: { type: "note", label: "Sent a Teams message" },
};

export class RepExtension extends DurableObject<Env> {
  private pending = new Map<string, Pending>();
  // Cached so the per-fetch `repId` persist is a no-op on repeat calls.
  private repId: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Hibernation heartbeat: workerd answers `{"type":"ping"}` with
    // `{"type":"pong"}` without waking the DO (zero CPU billed for keepalive).
    // The 25s extension cadence matches `shared/agent-ws-protocol.md`.
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair(
        JSON.stringify({ type: "ping" }),
        JSON.stringify({ type: "pong" }),
      ),
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Learn our own repId from the `/agents/:repId/...` path. The DO isn't
    // told its name; we need it to attribute captured activity. Persisted so
    // it survives hibernation (webSocketMessage can fire without a fetch).
    const segs = url.pathname.split("/").filter(Boolean);
    const repIdx = segs.indexOf("agents");
    const seenRepId = repIdx >= 0 ? segs[repIdx + 1] : undefined;
    if (seenRepId && seenRepId !== this.repId) {
      this.repId = seenRepId;
      await this.ctx.storage.put(REP_ID_KEY, seenRepId);
    }

    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      this.ctx.waitUntil(this.drain());
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (url.pathname.endsWith("/status")) {
      const enabled = (await this.ctx.storage.get<boolean>(ENABLED_KEY)) ?? false;
      const queue = (await this.ctx.storage.get<Queued[]>(QUEUE_KEY)) ?? [];
      return Response.json({
        online: this.ctx.getWebSockets().length > 0,
        enabled,
        queueDepth: queue.length,
      });
    }

    if (request.method === "POST" && url.pathname.endsWith("/act")) {
      return this.handleAct(request);
    }

    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  private async handleAct(request: Request): Promise<Response> {
    const body = await request.json<{ type?: string; params?: unknown }>().catch(() => null);
    if (!body?.type) {
      return new Response(JSON.stringify({ ok: false, error: "bad_request" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const id = crypto.randomUUID();
    const sockets = this.ctx.getWebSockets();
    const ws = sockets[0];

    if (!ws) {
      const queue = (await this.ctx.storage.get<Queued[]>(QUEUE_KEY)) ?? [];
      queue.push({ id, type: body.type, params: body.params, queuedAt: Date.now() });
      await this.ctx.storage.put(QUEUE_KEY, queue);
      return Response.json({ queued: true, id });
    }

    return this.sendAndAwait(ws, id, body.type, body.params);
  }

  private sendAndAwait(
    ws: WebSocket,
    id: string,
    type: string,
    params: unknown,
  ): Promise<Response> {
    return new Promise<Response>((resolveOuter) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolveOuter(
          new Response(JSON.stringify({ ok: false, error: "timeout" }), {
            status: 504,
            headers: { "content-type": "application/json" },
          }),
        );
      }, ACT_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: (result) => {
          resolveOuter(Response.json({ ok: true, result }));
        },
        reject: ({ error }) => {
          resolveOuter(
            new Response(JSON.stringify({ ok: false, error }), {
              status: error === "rep_disabled" ? 409 : 502,
              headers: { "content-type": "application/json" },
            }),
          );
        },
        timer,
      });

      try {
        ws.send(JSON.stringify({ id, type, params, ts: Date.now() }));
      } catch {
        const p = this.pending.get(id);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(id);
        }
        resolveOuter(
          new Response(JSON.stringify({ ok: false, error: "ws_send_failed" }), {
            status: 502,
            headers: { "content-type": "application/json" },
          }),
        );
      }
    });
  }

  override async webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let frame: unknown;
    try {
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);
      frame = JSON.parse(text);
    } catch {
      console.log("[RepExtension] non-JSON frame ignored");
      return;
    }

    if (!frame || typeof frame !== "object") return;
    const f = frame as Record<string, unknown>;

    // Command response: { id, ok, result | error }
    if (typeof f.id === "string") {
      const entry = this.pending.get(f.id);
      if (!entry) return; // stale or unknown id
      clearTimeout(entry.timer);
      this.pending.delete(f.id);
      if (f.ok === true) {
        entry.resolve(f.result);
      } else {
        const error = typeof f.error === "string" ? f.error : "internal";
        entry.reject({ error });
      }
      return;
    }

    // State events: { type: "online" | "toggle", enabled: bool }
    if (f.type === "online" || f.type === "toggle") {
      const prevEnabled = (await this.ctx.storage.get<boolean>(ENABLED_KEY)) ?? false;
      if (typeof f.enabled === "boolean") {
        await this.ctx.storage.put(ENABLED_KEY, f.enabled);
      }
      // Rep just flipped the master switch ON — wake the chat copilot so it
      // can pick up whatever it was blocked on. `online` frames at connect
      // time are skipped (we only want a "the user toggled" signal, not "we
      // reconnected with the switch already on").
      if (f.type === "toggle" && f.enabled === true && prevEnabled === false) {
        this.ctx.waitUntil(this.notifyAgentToggleOn());
      }
      return;
    }

    // Activity event: { type: "activity_event", event: {...} } — v0.2.
    // Ambient-capture touchpoint from a content-script adapter. Ingest off
    // the hot path so a slow D1 write doesn't stall the socket reader.
    if (f.type === "activity_event") {
      if (f.event && typeof f.event === "object") {
        this.ctx.waitUntil(this.ingestActivity(f.event as ActivityEvent));
      }
      return;
    }

    // Ping is handled by setWebSocketAutoResponse — should never reach here.
    if (f.type !== "ping") {
      console.log(`[RepExtension] unknown frame type=${String(f.type)}`);
    }
  }

  override async webSocketClose(
    _ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    console.log(`[RepExtension] webSocketClose code=${code} reason=${reason} wasClean=${wasClean}`);
    // Any in-flight `pending` entries will time out naturally; we deliberately
    // don't reject them here in case the rep reconnects within the 30s window.
  }

  override async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
    console.log(`[RepExtension] webSocketError: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Translate an extension `activity_event` into a CRM activity row.
  // Spec: shared/agent-ws-protocol.md v0.2 § "Activity events".
  private async ingestActivity(event: ActivityEvent): Promise<void> {
    try {
      const kind = typeof event.kind === "string" ? event.kind : "";
      const dedupeKey = typeof event.dedupeKey === "string" ? event.dedupeKey : "";
      const mapping = ACTIVITY_MAP[kind];
      if (!mapping || !dedupeKey) {
        console.log(`[RepExtension] activity ignored kind=${kind}`);
        return;
      }

      // Dedup — a cold extension SW start can replay events we already wrote.
      const seen = (await this.ctx.storage.get<Record<string, number>>(ACTIVITY_SEEN_KEY)) ?? {};
      if (seen[dedupeKey]) return;

      const contact = event.contact ?? {};
      const email = typeof contact.email === "string" ? contact.email.toLowerCase() : "";
      const name = typeof contact.name === "string" ? contact.name : "";
      const profileUrl = typeof contact.profileUrl === "string" ? contact.profileUrl : "";

      let customerId: string | null = null;
      if (kind === "email_received") {
        // Inbound mail: log ONLY against an existing customer; never create.
        customerId = email ? await resolveExistingCustomerByEmail(this.env, email) : null;
        if (!customerId) {
          console.log("[RepExtension] inbound email from non-customer — dropped");
          return;
        }
      } else {
        // Rep-initiated (sent / message / comment): resolve or create.
        const identity = email
          ? { email }
          : profileUrl
            ? { userId: profileUrl }
            : name
              ? { userId: `${event.site ?? "ext"}:${name}` }
              : null;
        if (!identity) {
          console.log(`[RepExtension] activity ${kind} has no resolvable contact — dropped`);
          return;
        }
        const res = await resolveOrCreateCustomer(this.env, identity);
        customerId = res.customerId;
      }

      const who = name || email || "a contact";
      const detail = event.subject || event.preview || "";
      const body = `${mapping.label} · ${who}${detail ? ` — ${detail}` : ""}`;
      const repId = this.repId ?? (await this.ctx.storage.get<string>(REP_ID_KEY)) ?? "extension";

      await db.appendActivity(this.env, {
        customerId,
        type: mapping.type,
        body: body.slice(0, 500),
        source: "ingest",
        actorId: repId,
      });

      // Record the dedupe key, pruning entries past the queue TTL so the map
      // stays bounded.
      const cutoff = Date.now() - QUEUE_TTL_MS;
      for (const [k, t] of Object.entries(seen)) {
        if (t < cutoff) delete seen[k];
      }
      seen[dedupeKey] = Date.now();
      await this.ctx.storage.put(ACTIVITY_SEEN_KEY, seen);
      console.log(`[RepExtension] activity logged kind=${kind} customer=${customerId}`);
    } catch (err) {
      console.log(
        `[RepExtension] activity ingest failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Cross-DO ping into the chat copilot so the rep sees an immediate "I'm
  // back" without having to re-prompt. Best-effort — we don't fail the WS
  // frame handling if the chat DO is cold or the route 404s on an older
  // backend; the next `browserStatus` tool call will still see the master
  // switch flipped on.
  private async notifyAgentToggleOn(): Promise<void> {
    const repId = this.repId ?? (await this.ctx.storage.get<string>(REP_ID_KEY));
    if (!repId) return;
    try {
      const stub = this.env.AGENT.get(this.env.AGENT.idFromName(repId));
      const res = await stub.fetch("https://internal.crema/internal/extension-toggled", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      if (!res.ok) {
        console.log(`[RepExtension] notifyAgentToggleOn ← ${res.status}`);
      }
    } catch (err) {
      console.log(
        `[RepExtension] notifyAgentToggleOn failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async drain(): Promise<void> {
    const queue = (await this.ctx.storage.get<Queued[]>(QUEUE_KEY)) ?? [];
    if (queue.length === 0) return;

    const now = Date.now();
    const fresh = queue.filter((q) => now - q.queuedAt <= QUEUE_TTL_MS);
    let remaining = fresh.slice();

    while (remaining.length > 0) {
      const sockets = this.ctx.getWebSockets();
      const ws = sockets[0];
      if (!ws) break; // socket gone mid-drain; persist what's left

      const next = remaining[0];
      try {
        ws.send(JSON.stringify({ id: next.id, type: next.type, params: next.params, ts: Date.now() }));
      } catch {
        break; // re-prepend implicit (we haven't sliced yet)
      }

      const responded = await this.waitForResponse(next.id);
      if (!responded) break; // timed out or socket dropped — leave at head

      remaining = remaining.slice(1);
    }

    await this.ctx.storage.put(QUEUE_KEY, remaining);
  }

  private waitForResponse(id: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(false);
      }, ACT_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: () => {
          clearTimeout(timer);
          this.pending.delete(id);
          resolve(true);
        },
        reject: () => {
          clearTimeout(timer);
          this.pending.delete(id);
          // Even on error, the entry has been delivered — advance the queue.
          resolve(true);
        },
        timer,
      });
    });
  }
}
