#!/usr/bin/env bun
/**
 * ws-smoke.ts — Open WSS to /agents/:repId/ws?token=<JWT> and exercise the
 * basic agent → backend flow:
 *
 *   1. open  → expect connection
 *   2. send  {type:"online", enabled:false}
 *   3. send  {type:"ping"}           → expect {type:"pong"} (hibernation pair)
 *   4. send  {type:"toggle", enabled:true}
 *   5. close cleanly (1000)
 *
 * Usage: AGENT_BASE_URL=http://localhost:8787 bun run scripts/integration/ws-smoke.ts [repId]
 */

import { wsUrl, repIdFromArgs, loadToken, logSection, logKv, assertOk } from "./_lib";

const PONG_TIMEOUT_MS = 5_000;

async function main() {
  const repId = repIdFromArgs();
  const token = await loadToken(repId);
  const url = `${wsUrl()}/agents/${encodeURIComponent(repId)}/ws?token=${encodeURIComponent(token)}`;
  logSection("ws-smoke");
  logKv("url", url.replace(/token=[^&]+/, "token=…"));

  const ws = new WebSocket(url);

  const pongPromise = new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("pong timeout")), PONG_TIMEOUT_MS);
    ws.addEventListener("message", (ev) => {
      const data = typeof ev.data === "string" ? ev.data : "";
      let parsed: { type?: string } | null = null;
      try { parsed = JSON.parse(data); } catch { /* drop non-JSON */ }
      logKv("← recv", data.slice(0, 200));
      if (parsed?.type === "pong") {
        clearTimeout(timer);
        resolve(parsed);
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connect timeout")), 10_000);
    ws.addEventListener("open", () => { clearTimeout(timer); resolve(); });
    ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("ws error before open")); });
    ws.addEventListener("close", (ev) => { clearTimeout(timer); reject(new Error(`closed before open: ${ev.code} ${ev.reason}`)); });
  });
  logKv("open", "ok");

  function send(msg: object) {
    const json = JSON.stringify(msg);
    logKv("→ send", json);
    ws.send(json);
  }

  send({ type: "online", enabled: false });
  send({ type: "ping" });
  const pong = await pongPromise;
  assertOk(pong, "no pong received");
  logKv("pong", "received");

  send({ type: "toggle", enabled: true });

  // small grace period so the toggle frame flushes before we close
  await new Promise((r) => setTimeout(r, 200));

  await new Promise<void>((resolve) => {
    ws.addEventListener("close", () => resolve());
    ws.close(1000, "smoke complete");
  });
  logKv("close", "1000");
  console.log("PASS");
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
