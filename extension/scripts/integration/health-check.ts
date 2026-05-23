#!/usr/bin/env bun
/**
 * health-check.ts — GET /health, expect 200 { ok: true, ... }.
 *
 * Usage: AGENT_BASE_URL=http://localhost:8787 bun run scripts/integration/health-check.ts
 */

import { baseUrl, logSection, logKv, assertOk } from "./_lib";

async function main() {
  const url = `${baseUrl()}/health`;
  logSection("health-check");
  logKv("url", url);

  const res = await fetch(url);
  const text = await res.text();
  logKv("status", res.status);
  logKv("body", text.slice(0, 200));

  assertOk(res.status === 200, `expected 200, got ${res.status}`);
  let body: { ok?: unknown } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    assertOk(false, `body is not JSON: ${text}`);
  }
  assertOk(body?.ok === true, `expected {ok:true}, got ${text}`);
  console.log("PASS");
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
