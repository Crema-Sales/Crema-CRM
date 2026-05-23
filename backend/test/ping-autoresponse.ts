// Verifies the hibernation auto-response on RepExtension: extension sends
// ping, DO replies pong without invoking webSocketMessage (zero CPU billed
// per the workerd `setWebSocketAutoResponse` contract). Prereq: `wrangler
// dev` running locally. Run via: `bun test/ping-autoresponse.ts`.

export {};

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const REP_ID = process.env.REP_ID ?? crypto.randomUUID();
const PING_COUNT = Number(process.env.PING_COUNT ?? 5);

type TokenResponse = { token: string; expiresIn: number };

async function getToken(): Promise<string> {
  const res = await fetch(`${BASE}/dev/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repId: REP_ID }),
  });
  if (!res.ok) throw new Error(`mint token failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as TokenResponse).token;
}

async function openWs(token: string): Promise<WebSocket> {
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

async function main(): Promise<void> {
  const token = await getToken();
  const ws = await openWs(token);
  console.log("[ping] WS connected");

  let pongs = 0;
  ws.addEventListener("message", (ev) => {
    if (typeof ev.data !== "string") return;
    try {
      const frame = JSON.parse(ev.data) as { type?: string };
      if (frame.type === "pong") pongs += 1;
    } catch {
      // ignore
    }
  });

  await new Promise((r) => setTimeout(r, 50));

  for (let i = 0; i < PING_COUNT; i += 1) {
    ws.send(JSON.stringify({ type: "ping" }));
    await new Promise((r) => setTimeout(r, 200));
  }

  // small grace for any in-flight frames
  await new Promise((r) => setTimeout(r, 500));
  ws.close(1000, "test-done");

  if (pongs !== PING_COUNT) {
    console.error(`[ping] FAIL: expected ${PING_COUNT} pongs, got ${pongs}`);
    process.exit(1);
  }
  console.log(`[ping] PASS: received ${pongs}/${PING_COUNT} pongs`);
}

main().catch((err) => {
  console.error("[ping] error:", err);
  process.exit(1);
});
