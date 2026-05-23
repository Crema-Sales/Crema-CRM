// End-to-end happy path against a running `wrangler dev`.
// Mints a JWT, queues a command while offline, opens the WS, watches the
// drain, then verifies a synchronous round-trip while the WS is open.
//
// Assumes the backend is reachable at $BASE_URL (default http://localhost:8787).
// The CI-style runner in `test/e2e-runner.ts` boots `wrangler dev` for you.

export {};

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const REP_ID = process.env.REP_ID ?? "e2e@example.com";

type TokenResponse = { token: string; expiresIn: number };
type Status = { online: boolean; enabled: boolean; queueDepth: number };
type ActResponse = {
  ok?: boolean;
  queued?: boolean;
  id?: string;
  result?: { tabId?: number };
  error?: string;
};

async function mintToken(): Promise<string> {
  const res = await fetch(`${BASE}/dev/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repId: REP_ID }),
  });
  if (!res.ok) {
    throw new Error(`mint token failed: ${res.status} ${await res.text()}`);
  }
  return ((await res.json()) as TokenResponse).token;
}

async function getStatus(token: string): Promise<Status> {
  const res = await fetch(`${BASE}/agents/${REP_ID}/status`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`status failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as Status;
}

async function postAct(
  token: string,
  body: { type: string; params: unknown },
): Promise<{ status: number; body: ActResponse }> {
  const res = await fetch(`${BASE}/agents/${REP_ID}/act`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as ActResponse };
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

function attachTabIdResponder(ws: WebSocket): void {
  ws.addEventListener("message", (ev) => {
    if (typeof ev.data !== "string") return;
    let frame: { id?: unknown };
    try {
      frame = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (typeof frame.id !== "string") return;
    ws.send(JSON.stringify({ id: frame.id, ok: true, result: { tabId: 42 } }));
  });
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  timeoutMs = 5_000,
  pollMs = 50,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await fn();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(
    `waitFor: predicate not satisfied within ${timeoutMs}ms; last=${JSON.stringify(last)}`,
  );
}

async function main(): Promise<void> {
  // (1) Mint a JWT for the e2e rep.
  const token = await mintToken();
  console.log(`[e2e] minted JWT for repId=${REP_ID}`);

  // (2) Status before any WS connects → online:false, queueDepth:0.
  const s1 = await getStatus(token);
  console.log(`[e2e] status (offline): ${JSON.stringify(s1)}`);
  assert(s1.online === false, `expected online:false, got online:${s1.online}`);
  assert(
    s1.queueDepth === 0,
    `expected queueDepth:0, got queueDepth:${s1.queueDepth}`,
  );

  // (3) POST /act while offline → command should be queued.
  const r1 = await postAct(token, {
    type: "navigate",
    params: { url: "https://example.com" },
  });
  console.log(`[e2e] POST /act (offline) → ${r1.status} ${JSON.stringify(r1.body)}`);
  assert(r1.status === 200, `expected 200, got ${r1.status}`);
  assert(
    r1.body.queued === true,
    `expected queued:true, got ${JSON.stringify(r1.body)}`,
  );

  // (4) Open the mock WS and arm the tabId:42 responder.
  const ws = await openMockWs(token);
  attachTabIdResponder(ws);
  console.log("[e2e] WS connected, responder attached");

  // (5) After the queue drains and the mock responds, status flips to online
  //     with queueDepth:0. Poll briefly — the drain is async.
  const s2 = await waitFor(
    () => getStatus(token),
    (s) => s.online === true && s.queueDepth === 0,
  );
  console.log(`[e2e] status (online): ${JSON.stringify(s2)}`);
  assert(s2.online === true, `expected online:true, got online:${s2.online}`);
  assert(
    s2.queueDepth === 0,
    `expected queueDepth:0, got queueDepth:${s2.queueDepth}`,
  );

  // (6) POST /act while WS is open → synchronous round-trip with tabId:42.
  const r2 = await postAct(token, {
    type: "navigate",
    params: { url: "https://example.com/two" },
  });
  console.log(`[e2e] POST /act (online) → ${r2.status} ${JSON.stringify(r2.body)}`);
  assert(r2.status === 200, `expected 200, got ${r2.status}`);
  assert(
    r2.body.ok === true,
    `expected ok:true, got ${JSON.stringify(r2.body)}`,
  );
  assert(
    r2.body.result?.tabId === 42,
    `expected result.tabId:42, got ${JSON.stringify(r2.body.result)}`,
  );

  ws.close(1000, "test-done");
  console.log("[e2e] PASS");
}

main().catch((err) => {
  console.error("[e2e] FAIL:", err);
  process.exit(1);
});
