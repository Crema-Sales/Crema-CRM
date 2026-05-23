/**
 * Shared helpers for the integration smoke scripts.
 *
 * All scripts read `AGENT_BASE_URL` from the environment. Examples:
 *   AGENT_BASE_URL=http://localhost:8787  bun run scripts/integration/health-check.ts
 *   AGENT_BASE_URL=https://ctrl-alt-elite-agent.workers.dev  bun run scripts/integration/run-all.ts test-rep
 *
 * Tokens are obtained by `mint-token.ts` and cached on disk under
 * `scripts/integration/.token-<repId>.json` so the scripts can be chained.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

export const DEFAULT_REP_ID = "test-rep";

export function baseUrl(): string {
  const v = process.env.AGENT_BASE_URL;
  if (!v) {
    console.error("AGENT_BASE_URL is required (e.g. http://localhost:8787 or https://ctrl-alt-elite-agent.workers.dev)");
    process.exit(2);
  }
  return v.replace(/\/+$/, "");
}

export function wsUrl(): string {
  return baseUrl().replace(/^http(s?):/i, (_, s) => `ws${s}:`);
}

const TOKEN_DIR = resolve(import.meta.dir, ".tokens");

function tokenPath(repId: string): string {
  return resolve(TOKEN_DIR, `${repId}.json`);
}

export async function saveToken(repId: string, token: string, expiresIn?: number): Promise<void> {
  await mkdir(TOKEN_DIR, { recursive: true });
  const payload = { token, repId, expiresIn, savedAt: Date.now() };
  await writeFile(tokenPath(repId), JSON.stringify(payload, null, 2));
}

export async function loadToken(repId: string): Promise<string> {
  const p = tokenPath(repId);
  if (!existsSync(p)) {
    console.error(`No cached token for ${repId} at ${p}. Run mint-token.ts first.`);
    process.exit(2);
  }
  const raw = await readFile(p, "utf8");
  const obj = JSON.parse(raw) as { token?: string };
  if (!obj.token) {
    console.error(`Cached token file ${p} is malformed.`);
    process.exit(2);
  }
  return obj.token;
}

export function repIdFromArgs(fallback: string = DEFAULT_REP_ID): string {
  return process.argv[2] ?? fallback;
}

export function logSection(title: string): void {
  console.log(`\n=== ${title} ===`);
}

export function logKv(k: string, v: unknown): void {
  console.log(`  ${k.padEnd(14)} ${typeof v === "string" ? v : JSON.stringify(v)}`);
}

export function assertOk(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

void dirname;
