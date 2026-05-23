#!/usr/bin/env bun
/**
 * status-check.ts — GET /agents/:repId/status with the cached JWT,
 * print {online, enabled, queueDepth}.
 *
 * Usage: AGENT_BASE_URL=http://localhost:8787 bun run scripts/integration/status-check.ts [repId]
 */

import { baseUrl, repIdFromArgs, loadToken, logSection, logKv, assertOk } from "./_lib";

async function main() {
  const repId = repIdFromArgs();
  const token = await loadToken(repId);
  const url = `${baseUrl()}/agents/${encodeURIComponent(repId)}/status`;
  logSection("status-check");
  logKv("url", url);

  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const text = await res.text();
  logKv("status", res.status);
  logKv("body", text);

  assertOk(res.status === 200, `expected 200, got ${res.status}`);
  const body = JSON.parse(text) as {
    online?: boolean;
    enabled?: boolean;
    queueDepth?: number;
  };
  assertOk(typeof body.online === "boolean", "missing 'online' boolean");
  assertOk(typeof body.enabled === "boolean", "missing 'enabled' boolean");
  assertOk(typeof body.queueDepth === "number", "missing 'queueDepth' number");
  console.log("PASS");
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
