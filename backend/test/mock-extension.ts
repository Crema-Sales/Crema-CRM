// End-to-end smoke for /agents/:repId/act → RepExtension DO → mock extension over WS.
// Prereq: `wrangler dev` running locally (default http://localhost:8787).
// Run via: `bun run test:mock`.

export {};

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const REP_ID = process.env.REP_ID ?? crypto.randomUUID();

type TokenResponse = { token: string; expiresIn: number };
type ActResponse = { ok?: boolean; result?: { echo?: unknown }; error?: string };

async function getToken(): Promise<string> {
  const res = await fetch(`${BASE}/dev/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repId: REP_ID }),
  });
  if (!res.ok) throw new Error(`mint token failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as TokenResponse;
  return body.token;
}

async function openMockWs(token: string): Promise<WebSocket> {
  const url = `${BASE.replace(/^http/, "ws")}/agents/${REP_ID}/ws?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url);
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
  return ws;
}

function attachEcho(ws: WebSocket): void {
  ws.addEventListener("message", (ev) => {
    if (typeof ev.data !== "string") return;
    let frame: { id?: unknown; type?: unknown; params?: unknown };
    try {
      frame = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (typeof frame.id !== "string") return;
    const echo = { id: frame.id, ok: true, result: { echo: frame.params ?? null } };
    console.log(`[mock] echo for id=${frame.id} type=${String(frame.type)}`);
    ws.send(JSON.stringify(echo));
  });
}

async function main(): Promise<void> {
  const token = await getToken();
  console.log("[mock] minted JWT");

  const ws = await openMockWs(token);
  attachEcho(ws);
  console.log("[mock] WS connected");

  // Give the DO a tick to register the accepted socket before we POST.
  await new Promise((r) => setTimeout(r, 50));

  const params = { tabId: 1, url: "https://example.com" };
  const actRes = await fetch(`${BASE}/agents/${REP_ID}/act`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ type: "navigate", params }),
  });
  const body = (await actRes.json()) as ActResponse;
  console.log(`[mock] POST /act → ${actRes.status} ${JSON.stringify(body)}`);

  ws.close(1000, "test-done");

  const ok =
    actRes.status === 200 &&
    body.ok === true &&
    body.result !== undefined &&
    JSON.stringify(body.result.echo) === JSON.stringify(params);
  if (!ok) {
    console.error("[mock] FAIL: response did not echo params");
    process.exit(1);
  }
  console.log("[mock] PASS");
}

main().catch((err) => {
  console.error("[mock] error:", err);
  process.exit(1);
});
