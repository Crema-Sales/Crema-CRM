// CI-style runner for `test/e2e.ts`.
// Spawns `wrangler dev`, waits for `/health` to return 200, runs the e2e test,
// then kills `wrangler dev` regardless of pass/fail.
//
// Run via `bun run test:e2e`. The script itself is invoked under `node
// --experimental-strip-types`; spawning workerd (Cloudflare's runtime) from a
// Bun parent triggers an `setsocketopt(TCP_NODELAY): Invalid argument` fault
// in the local proxy, so we route through node here. Node 22+ has the fetch
// and WebSocket globals the e2e test needs.

import { spawn, type ChildProcess } from "node:child_process";

const PORT = Number(process.env.PORT ?? 8787);
const BASE = `http://localhost:${PORT}`;
const READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 200;

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.status === 200) return;
    } catch {
      // wrangler dev not listening yet
    }
    await new Promise((r) => setTimeout(r, READY_POLL_MS));
  }
  throw new Error(`wrangler dev did not become healthy within ${READY_TIMEOUT_MS}ms`);
}

function waitForExit(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve) => child.once("exit", (code) => resolve(code)));
}

async function main(): Promise<void> {
  console.log(`[runner] spawning wrangler dev on :${PORT}`);
  // Wrangler's interactive dev session reads stdin for hotkeys. When stdin is
  // inherited from a parent that has no usable input (e.g. another bun-spawn
  // chain), workerd's local proxy intermittently fails with
  // `setsocketopt(TCP_NODELAY): Invalid argument`. Piping stdin from /dev/null
  // sidesteps the interactive path.
  const wrangler = spawn(
    "bunx",
    ["wrangler", "dev", "--port", String(PORT)],
    { stdio: ["ignore", "inherit", "inherit"] },
  );

  let testExit: number | null = 1;
  try {
    await waitForHealth();
    console.log("[runner] wrangler dev healthy; running e2e");

    const test = spawn(
      "node",
      ["--experimental-strip-types", "--no-warnings", "test/e2e.ts"],
      {
        stdio: "inherit",
        env: { ...process.env, BASE_URL: BASE },
      },
    );
    testExit = await waitForExit(test);
  } finally {
    console.log("[runner] killing wrangler dev");
    wrangler.kill("SIGTERM");
    await waitForExit(wrangler);
  }

  process.exit(testExit ?? 1);
}

main().catch((err) => {
  console.error("[runner] error:", err);
  process.exit(1);
});
