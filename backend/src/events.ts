// Publish helper for the CustomerStream DO. Every D1 mutation goes through
// db.ts; db.ts calls into here after the write succeeds. Failures are logged
// but never propagate — a failed publish must not roll back the underlying
// write or fail the API response.

import type { Env } from "./index";
import type { SseEvent } from "./customer-stream";

export type { SseEvent };

export async function publishCustomerEvent(
  env: Env,
  customerId: string,
  event: Omit<SseEvent, "ts"> & { ts?: string },
): Promise<void> {
  try {
    const id = env.CUSTOMER_STREAM.idFromName(customerId);
    await env.CUSTOMER_STREAM.get(id).fetch("http://internal/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ts: new Date().toISOString(), ...event }),
    });
  } catch (err) {
    console.log(
      `[events] publish failed customerId=${customerId} type=${event.type}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
