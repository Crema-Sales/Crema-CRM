#!/usr/bin/env bun
/**
 * mint-token.ts — POST /dev/token, print + cache the JWT.
 *
 * Usage: AGENT_BASE_URL=http://localhost:8787 bun run scripts/integration/mint-token.ts [repId]
 *
 * The /dev/token route is gated to ENVIRONMENT=dev on the Worker — production
 * deploys will return 404. That's intentional: real tokens come from the
 * cremasales.com login flow.
 */

import { baseUrl, repIdFromArgs, saveToken, logSection, logKv, assertOk } from "./_lib";

async function main() {
  const repId = repIdFromArgs();
  const url = `${baseUrl()}/dev/token`;
  logSection("mint-token");
  logKv("repId", repId);
  logKv("url", url);

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repId }),
  });
  const text = await res.text();
  assertOk(res.ok, `POST /dev/token → ${res.status} ${text}`);

  const body = JSON.parse(text) as { token?: string; expiresIn?: number };
  assertOk(body.token, `response missing 'token': ${text}`);

  await saveToken(repId, body.token, body.expiresIn);
  logKv("token", `${body.token.slice(0, 24)}…(${body.token.length} chars)`);
  logKv("expiresIn", body.expiresIn ?? "(unknown)");
  console.log("PASS");
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
