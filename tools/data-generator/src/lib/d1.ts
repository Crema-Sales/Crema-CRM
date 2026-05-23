// Thin wrapper around `wrangler d1` for the ctv_crm database. We shell out
// instead of using a library so the script stays dependency-free and the
// auth is whatever the dev already has via `wrangler login`. Using
// spawnSync with array args — no shell, no injection surface.

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FRONTEND_DIR = join(import.meta.dirname, "..", "..", "..", "..", "frontend");
const DB_NAME = "ctv_crm";

export type Target = "local" | "remote";
export type Row = Record<string, unknown>;

// Parse a wrangler --json blob, skipping any progress-line preamble that
// wrangler prints before the JSON payload (especially on --remote --file).
function parseJsonBlob(stdout: string): Array<{ results?: Row[] }> {
  const start = stdout.indexOf("[");
  if (start === -1) return [];
  try {
    return JSON.parse(stdout.slice(start)) as Array<{ results?: Row[] }>;
  } catch {
    return [];
  }
}

// Run a batch of write statements. Uses --file because it's the only mode
// that handles multi-statement SQL; the trade-off is that --file does NOT
// return query results on --remote (wrangler reports only metadata like
// "Total queries executed"), so this path is for writes only.
export function runSql(target: Target, sql: string): void {
  const dir = mkdtempSync(join(tmpdir(), "datagen-"));
  const file = join(dir, "stmt.sql");
  writeFileSync(file, sql);
  const res = spawnSync(
    "bunx",
    ["wrangler", "d1", "execute", DB_NAME, `--${target}`, "--file", file, "--json"],
    { cwd: FRONTEND_DIR, encoding: "utf8" },
  );
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || "").trim();
    throw new Error(`wrangler d1 execute failed (status ${res.status}):\n${err}`);
  }
}

// Run a single SELECT and return rows. Uses --command because --file does
// not return query results from the remote D1 endpoint.
export function query(target: Target, sql: string): Row[] {
  const res = spawnSync(
    "bunx",
    ["wrangler", "d1", "execute", DB_NAME, `--${target}`, "--command", sql, "--json"],
    { cwd: FRONTEND_DIR, encoding: "utf8" },
  );
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || "").trim();
    throw new Error(`wrangler d1 query failed (status ${res.status}):\n${err}`);
  }
  return parseJsonBlob(res.stdout).flatMap((r) => r.results ?? []);
}
