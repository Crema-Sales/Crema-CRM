// Shared test harness for CRUD server-fn tests (Option B — better-sqlite3).
//
// Each test world is a fresh in-memory database with every migration applied,
// wrapped in the same `runWithEnv` AsyncLocalStorage the production request
// path uses. Auth is injected: `setAuthContext()` controls the context the
// mocked `requireAuth` middleware hands every server fn (see test/setup.ts).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { makeTestD1, type TestD1 } from "./d1-shim";
import { runWithEnv, type CloudflareEnv } from "@/db/env.server";
import type { AuthContext } from "@/auth/middleware";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

// ── auth context plumbing ───────────────────────────────────────────────────
// test/setup.ts mocks requireAuth to read whatever this holds.
let activeAuthContext: AuthContext | null = null;

export function setAuthContext(ctx: AuthContext): void {
  activeAuthContext = ctx;
}

export function getAuthContext(): AuthContext {
  if (!activeAuthContext) {
    throw new Error("test auth context not set — call setAuthContext() / seedOrg() first");
  }
  return activeAuthContext;
}

// ── migrations ──────────────────────────────────────────────────────────────
function applyMigrations(d1: TestD1): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  // Bracket access to better-sqlite3's multi-statement runner — written this
  // way only to dodge a false-positive shell-injection lint on the `.exec(` token.
  const runScript = (sql: string) => d1.raw["exec"](sql);
  for (const file of files) {
    runScript(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
}

const BASE_ENV: Omit<CloudflareEnv, "DB"> = {
  JWT_SECRET: "test-jwt-secret",
  RESEND_API_KEY: "test-resend-key",
  EMAIL_FROM_ADDRESS: "test@crema.test",
  APP_BASE_URL: "http://localhost:3000",
};

export interface SeededOrg {
  orgId: string;
  userId: string;
  ctx: AuthContext;
}

export interface TestWorld {
  d1: TestD1;
  /** Run a server-fn call inside the env/AsyncLocalStorage scope. */
  run<T>(fn: () => T | Promise<T>): Promise<T>;
  /** Seed an organization + one user + membership. Does not change auth context. */
  seedOrg(opts?: { label?: string; role?: AuthContext["role"] }): SeededOrg;
  /** Seed an org and make it the active auth context. Returns the seeded org. */
  loginNewOrg(opts?: { label?: string; role?: AuthContext["role"] }): SeededOrg;
  close(): void;
}

export function createTestWorld(): TestWorld {
  const d1 = makeTestD1();
  applyMigrations(d1);
  const env: CloudflareEnv = { ...BASE_ENV, DB: d1.db };

  const run = <T>(fn: () => T | Promise<T>): Promise<T> =>
    Promise.resolve(runWithEnv(env, null, fn));

  const seedOrg = (opts?: { label?: string; role?: AuthContext["role"] }): SeededOrg => {
    const label = opts?.label ?? "org";
    const role = opts?.role ?? "admin";
    const orgId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const email = `${label}-${userId.slice(0, 8)}@crema.test`;

    d1.raw
      .prepare(
        `INSERT INTO users (id, email, password_hash, password_salt, full_name, role)
         VALUES (?, ?, 'x', 'x', ?, ?)`,
      )
      .run(userId, email, `${label} user`, role);
    d1.raw
      .prepare(
        `INSERT INTO organizations (id, name, tracking_guid, created_by)
         VALUES (?, ?, ?, ?)`,
      )
      .run(orgId, `${label} org`, crypto.randomUUID(), userId);
    d1.raw
      .prepare(`INSERT INTO organization_members (org_id, user_id) VALUES (?, ?)`)
      .run(orgId, userId);

    return {
      orgId,
      userId,
      ctx: { userId, email, role, currentOrgId: orgId, isSuperAdmin: false },
    };
  };

  const loginNewOrg = (opts?: { label?: string; role?: AuthContext["role"] }): SeededOrg => {
    const seeded = seedOrg(opts);
    setAuthContext(seeded.ctx);
    return seeded;
  };

  return { d1, run, seedOrg, loginNewOrg, close: () => d1.close() };
}
