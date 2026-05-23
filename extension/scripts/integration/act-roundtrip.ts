#!/usr/bin/env bun
/**
 * act-roundtrip.ts — End-to-end test of the command surface.
 *
 *   1. Open WS as the "rep extension" and send {type:"online", enabled:true}
 *   2. POST /agents/:repId/act with a fake command (an `eval` for `page_url`)
 *   3. The WS client receives the command from the DO
 *   4. WS client replies with a synthetic {id, ok:true, result:{value:"https://example.test"}}
 *   5. The POST /act response should resolve with that result
 *
 * This validates the full duplex path: DO → ext → DO → API client.
 *
 * Usage: AGENT_BASE_URL=http://localhost:8787 bun run scripts/integration/act-roundtrip.ts [repId]
 */

import { baseUrl, wsUrl, repIdFromArgs, loadToken, logSection, logKv, assertOk } from "./_lib";

const ROUNDTRIP_TIMEOUT_MS = 15_000;

async function main() {
  const repId = repIdFromArgs();
  const token = await loadToken(repId);
  const wsURL = `${wsUrl()}/agents/${encodeURIComponent(repId)}/ws?token=${encodeURIComponent(token)}`;
  const actURL = `${baseUrl()}/agents/${encodeURIComponent(repId)}/act`;

  logSection("act-roundtrip");
  logKv("ws",  wsURL.replace(/token=[^&]+/, "token=…"));
  logKv("act", actURL);

  const ws = new WebSocket(wsURL);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ws connect timeout")), 10_000);
    ws.addEventListener("open", () => { clearTimeout(timer); resolve(); });
    ws.addEventListener("close", (ev) => { clearTimeout(timer); reject(new Error(`closed: ${ev.code} ${ev.reason}`)); });
    ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("ws error before open")); });
  });
  logKv("open", "ok");

  ws.send(JSON.stringify({ type: "online", enabled: true }));

  // Wire the fake-extension behavior: respond to any incoming command with a
  // canned success result.
  ws.addEventListener("message", (ev) => {
    const data = typeof ev.data === "string" ? ev.data : "";
    let msg: { id?: string; type?: string } | null = null;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || !msg.id || !msg.type || msg.type === "pong") return;
    logKv("← cmd", data.slice(0, 200));
    const reply = {
      id: msg.id,
      ok: true,
      result: { value: "https://example.test", _synthetic: true },
    };
    logKv("→ ack", JSON.stringify(reply));
    ws.send(JSON.stringify(reply));
  });

  const actPromise = (async () => {
    const res = await fetch(actURL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ type: "eval", params: { name: "page_url", tabId: 1 } }),
    });
    return { status: res.status, text: await res.text() };
  })();

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("act roundtrip timed out")), ROUNDTRIP_TIMEOUT_MS),
  );
  const actRes = (await Promise.race([actPromise, timeout])) as { status: number; text: string };

  logKv("status", actRes.status);
  logKv("body", actRes.text.slice(0, 400));

  // Two valid outcomes:
  //  - {ok:true, result:{value:"https://example.test", _synthetic:true}} — sync drain
  //  - {queued:true, id:"..."}                                            — async path
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(actRes.text); } catch { /* fall through */ }

  assertOk(actRes.status === 200, `expected 200, got ${actRes.status}`);
  if (body.queued === true) {
    assertOk(typeof body.id === "string", "queued response missing id");
    logKv("mode", "queued");
  } else {
    assertOk(body.ok === true, `expected ok:true, got ${actRes.text}`);
    logKv("mode", "sync");
    const result = body.result as { value?: unknown; _synthetic?: unknown } | undefined;
    assertOk(result?.value === "https://example.test", `expected our synthetic value back, got ${JSON.stringify(result)}`);
  }

  ws.close(1000, "roundtrip complete");
  console.log("PASS");
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
