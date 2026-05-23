// Offline queue end-to-end test for the RepExtension DO.
// Boots a worker via wrangler's `unstable_dev`, exercises the queue + drain.
// Uses node:test because wrangler's unstable_dev hangs under the bun runtime.

import { strict as assert } from "node:assert";
import { after, before, test } from "node:test";
import { unstable_dev, type Unstable_DevWorker } from "wrangler";

const REP_ID = crypto.randomUUID();
let worker: Unstable_DevWorker;
let token: string;

before(async () => {
  worker = await unstable_dev("src/index.ts", {
    experimental: { disableExperimentalWarning: true },
    vars: { ENVIRONMENT: "dev", JWT_SIGNING_KEY: "test-secret" },
  });

  const res = await worker.fetch("/dev/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repId: REP_ID }),
  });
  if (!res.ok) throw new Error(`token mint failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { token: string };
  token = body.token;
});

after(async () => {
  if (worker) await worker.stop();
});

async function getStatus(): Promise<{
  online: boolean;
  enabled: boolean;
  queueDepth: number;
}> {
  const res = await worker.fetch(`/agents/${REP_ID}/status`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`status failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as {
    online: boolean;
    enabled: boolean;
    queueDepth: number;
  };
}

test("queues when offline, drains on connect, reflects in status", async () => {
  // (1) POST /act with no WS → {queued:true}
  const params = { tabId: 1, url: "https://example.com" };
  const r1 = await worker.fetch(`/agents/${REP_ID}/act`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ type: "navigate", params }),
  });
  assert.equal(r1.status, 200, "POST /act should return 200 when offline");
  const b1 = (await r1.json()) as { queued?: boolean; id?: string };
  assert.equal(b1.queued, true, "response should have queued: true");
  assert.equal(typeof b1.id, "string", "response should have an id");

  const s1 = await getStatus();
  assert.equal(s1.queueDepth, 1, "queueDepth should be 1 after queuing");
  assert.equal(s1.online, false, "online should be false before WS connects");

  // (2) Connect mock extension WS, expect to receive the queued command.
  const wsUrl = `ws://${worker.address}:${worker.port}/agents/${REP_ID}/ws?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ws open timeout (5s)")), 5_000);
    ws.addEventListener("open", () => {
      clearTimeout(t);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(t);
      reject(new Error("ws error during open"));
    });
  });

  const drained = await new Promise<{
    id: string;
    type: string;
    params: unknown;
  }>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error("did not receive queued command within 5s")),
      5_000,
    );
    ws.addEventListener("message", (ev) => {
      if (typeof ev.data !== "string") return;
      let f: { id?: unknown; type?: unknown; params?: unknown };
      try {
        f = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (typeof f.id === "string" && typeof f.type === "string") {
        clearTimeout(t);
        resolve(f as { id: string; type: string; params: unknown });
      }
    });
  });
  assert.equal(drained.type, "navigate", "drained command should be navigate");
  assert.equal(
    JSON.stringify(drained.params),
    JSON.stringify(params),
    "drained params should round-trip exactly",
  );

  // (3) Mock responds → next call to GET /status shows queueDepth: 0.
  ws.send(
    JSON.stringify({
      id: drained.id,
      ok: true,
      result: { echo: drained.params },
    }),
  );

  const deadline = Date.now() + 5_000;
  let depth = 1;
  let online = false;
  while (Date.now() < deadline) {
    const s = await getStatus();
    depth = s.queueDepth;
    online = s.online;
    if (depth === 0 && online) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.equal(depth, 0, "queueDepth should drain to 0");
  assert.equal(online, true, "status should report online: true while WS is open");

  ws.close(1000, "test-done");
});

test("WS upgrade closes with 4401 when JWT is missing", async () => {
  const wsUrl = `ws://${worker.address}:${worker.port}/agents/${REP_ID}/ws`;
  const ws = new WebSocket(wsUrl);
  const { code } = await new Promise<{ code: number }>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ws close timeout (5s)")), 5_000);
    ws.addEventListener("close", (ev) => {
      clearTimeout(t);
      resolve({ code: ev.code });
    });
    ws.addEventListener("error", () => {
      // some clients surface the close as error first; ignore — close fires next.
    });
  });
  assert.equal(code, 4401, "expected terminal close code 4401");
});

test("WS upgrade closes with 4400 when repId is malformed", async () => {
  const bad = "not-an-email-or-uuid";
  const wsUrl = `ws://${worker.address}:${worker.port}/agents/${bad}/ws?token=anything`;
  const ws = new WebSocket(wsUrl);
  const { code } = await new Promise<{ code: number }>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("ws close timeout (5s)")), 5_000);
    ws.addEventListener("close", (ev) => {
      clearTimeout(t);
      resolve({ code: ev.code });
    });
    ws.addEventListener("error", () => {
      // ignore — close fires next.
    });
  });
  assert.equal(code, 4400, "expected terminal close code 4400");
});
