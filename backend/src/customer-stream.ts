// CustomerStream — one Durable Object per customer id. Manages live SSE
// subscribers (the UI's `GET /v1/customers/:id/events` consumers + the
// RepAgent DO when it cares about a particular customer) and a small ring
// buffer of recent events for late-joiners.
//
// Wire format: every frame is `data: <JSON>\n\n` on the SSE stream. JSON
// payload conforms to the SseEvent shape declared inline below — keep this
// envelope stable; frontend chat + dashboards will subscribe.

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";

export type SseEvent = {
  type:
    | "customer.updated"
    | "customer.deleted"
    | "activity.created"
    | "lead.updated"
    | "ticket.updated"
    | "agent.proactive";
  customerId?: string;
  activityId?: string;
  payload: unknown;
  ts: string;
  requestId?: string;
};

const RING_SIZE = 50;

type Subscriber = {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

export class CustomerStream extends DurableObject<Env> {
  private subscribers = new Set<Subscriber>();
  // The ring buffer is small enough to live in-memory; we don't persist it
  // because subscribers reconnect with `Last-Event-ID` only after Phase 09b.
  private ring: SseEvent[] = [];

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/publish" && request.method === "POST") {
      const event = (await request.json()) as SseEvent;
      this.ring.push(event);
      if (this.ring.length > RING_SIZE) this.ring.splice(0, this.ring.length - RING_SIZE);
      const payload = encodeSseFrame(event);
      const dead: Subscriber[] = [];
      for (const sub of this.subscribers) {
        try {
          sub.controller.enqueue(payload);
        } catch {
          dead.push(sub);
        }
      }
      for (const d of dead) this.subscribers.delete(d);
      return Response.json({ ok: true, delivered: this.subscribers.size - dead.length });
    }

    if (url.pathname === "/subscribe" && request.method === "GET") {
      const encoder = new TextEncoder();
      const subscribers = this.subscribers;
      const ring = this.ring;
      const sub: Subscriber = {
        id: crypto.randomUUID(),
        controller: undefined as unknown as ReadableStreamDefaultController<Uint8Array>,
      };
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          sub.controller = controller;
          subscribers.add(sub);
          controller.enqueue(encoder.encode(`: hello ${new Date().toISOString()}\n\n`));
          for (const event of ring.slice(-5)) {
            controller.enqueue(encodeSseFrame(event));
          }
        },
        cancel() {
          subscribers.delete(sub);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    }

    return new Response("not found", { status: 404 });
  }
}

function encodeSseFrame(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}
