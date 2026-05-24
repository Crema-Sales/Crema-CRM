/// <reference types="@cloudflare/workers-types" />
import { AsyncLocalStorage } from "node:async_hooks";

export interface CloudflareEnv {
  DB: D1Database;
  JWT_SECRET: string;
  INGEST_WEBHOOK_SECRET?: string;
  RESEND_API_KEY: string;
  EMAIL_FROM_ADDRESS: string;
  APP_BASE_URL: string;
  /** Gates /api/dev-smoke-email in production. 404s if x-dev-key doesn't match. */
  DEV_SMOKE_KEY?: string;
  DEV_AUTO_LOGIN_EMAIL?: string;
  /** Required for agentic enrichment of companies/contacts (lib/enrichment.server.ts). */
  OPENROUTER_API_KEY?: string;
  /** Optional — when set, enrichment uses Tavily; otherwise it falls back to direct page fetches. */
  TAVILY_API_KEY?: string;
  /**
   * Backend agent Worker base URL. Used by /api/v1/coach/chat to proxy
   * synchronous coach turns. Defaults to the prod Worker when unset.
   */
  COACH_AGENT_URL?: string;
}

interface EnvStore {
  env: CloudflareEnv;
  ctx: ExecutionContext | null;
}

const storage = new AsyncLocalStorage<EnvStore>();

export function runWithEnv<T>(
  env: CloudflareEnv,
  ctx: ExecutionContext | null,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return storage.run({ env, ctx }, fn);
}

export function getEnv(): CloudflareEnv {
  const store = storage.getStore();
  if (!store) throw new Error("Cloudflare env not available — request not wrapped with runWithEnv");
  return store.env;
}

export function getDB(): D1Database {
  return getEnv().DB;
}

export function getExecutionCtx(): ExecutionContext | null {
  return storage.getStore()?.ctx ?? null;
}
