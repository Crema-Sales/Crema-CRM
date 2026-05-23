#!/usr/bin/env bun
/**
 * run-all.ts — Sequential green-light runner.
 *
 *   1. health-check
 *   2. mint-token
 *   3. status-check
 *   4. ws-smoke
 *   5. act-roundtrip
 *
 * Usage: AGENT_BASE_URL=http://localhost:8787 bun run scripts/integration/run-all.ts [repId]
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const HERE = import.meta.dir;
const repId = process.argv[2] ?? "test-rep";

const steps: Array<{ name: string; file: string; needsRepId: boolean }> = [
  { name: "health-check",   file: "health-check.ts",   needsRepId: false },
  { name: "mint-token",     file: "mint-token.ts",     needsRepId: true },
  { name: "status-check",   file: "status-check.ts",   needsRepId: true },
  { name: "ws-smoke",       file: "ws-smoke.ts",       needsRepId: true },
  { name: "act-roundtrip",  file: "act-roundtrip.ts",  needsRepId: true },
];

let failed = 0;
for (const step of steps) {
  console.log(`\n>>> ${step.name}`);
  const args = ["run", resolve(HERE, step.file)];
  if (step.needsRepId) args.push(repId);
  const r = spawnSync("bun", args, { stdio: "inherit", env: process.env });
  if (r.status !== 0) {
    console.error(`<<< ${step.name} FAILED (exit ${r.status})`);
    failed += 1;
    // Don't abort — keep going so the user sees the full picture.
  }
}

console.log("\n=== Summary ===");
console.log(`  passed: ${steps.length - failed} / ${steps.length}`);
process.exit(failed === 0 ? 0 : 1);
