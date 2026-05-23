// Minimal D1Database adapter over better-sqlite3 for tests (Option B).
//
// crm.functions.ts only ever touches `.prepare(sql).bind(...).all()/.first()/.run()`,
// so that is the entire surface this shim implements. It is NOT a full D1
// emulation — it is just enough to run the real server-fn handlers against an
// in-memory SQLite database. SQL dialect drift vs. real D1 is the known
// trade-off of choosing Option B over Miniflare.
import Database from "better-sqlite3";
import type { D1Database } from "@cloudflare/workers-types";

// D1 accepts booleans/undefined as bind params; better-sqlite3 rejects both.
// Coerce to the integer/null forms D1 would have stored.
function coerce(values: unknown[]): unknown[] {
  return values.map((v) => {
    if (v === undefined) return null;
    if (typeof v === "boolean") return v ? 1 : 0;
    return v;
  });
}

class ShimStatement {
  constructor(
    private readonly db: Database.Database,
    private readonly sql: string,
    private readonly boundArgs: unknown[] = [],
  ) {}

  bind(...values: unknown[]): ShimStatement {
    return new ShimStatement(this.db, this.sql, coerce(values));
  }

  async all<T = Record<string, unknown>>(): Promise<{
    results: T[];
    success: true;
    meta: Record<string, unknown>;
  }> {
    const stmt = this.db.prepare(this.sql);
    const results = stmt.all(...this.boundArgs) as T[];
    return { results, success: true, meta: {} };
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.boundArgs) as
      | Record<string, unknown>
      | undefined;
    if (row === undefined) return null;
    if (colName !== undefined) return (row[colName] ?? null) as T;
    return row as T;
  }

  async run(): Promise<{
    success: true;
    results: [];
    meta: { changes: number; last_row_id: number; duration: number };
  }> {
    const info = this.db.prepare(this.sql).run(...this.boundArgs);
    return {
      success: true,
      results: [],
      meta: {
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
        duration: 0,
      },
    };
  }
}

export interface TestD1 {
  db: D1Database;
  raw: Database.Database;
  close(): void;
}

/** Build a fresh in-memory D1-shaped database. Caller applies migrations. */
export function makeTestD1(): TestD1 {
  const raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  const db = {
    prepare: (sql: string) => new ShimStatement(raw, sql),
  } as unknown as D1Database;
  return { db, raw, close: () => raw.close() };
}
