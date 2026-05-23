# AGENTS-WORKERS.md — Cloudflare Workers Runtime (agent backend)

> The Cloudflare runtime hosting the agent worker (`ctrl-alt-elite-agent`) and its Durable Objects. Linked from [`AGENTS.md`](./AGENTS.md). Sibling docs: [`AGENTS-API.md`](./AGENTS-API.md) (HTTP contract this Worker exposes), [`AGENTS-AGENTS.md`](./AGENTS-AGENTS.md) (the `RepAgent` DO built on top of this runtime), [`AGENTS-DEVOPS.md`](./AGENTS-DEVOPS.md) (the CRM worker's deploy reference).

This doc is about `backend/` only. For the CRM worker (`ctv-crm`) deploy, secrets, and D1, see [`AGENTS-DEVOPS.md`](./AGENTS-DEVOPS.md).

## What lives where

```
backend/
├── wrangler.toml       # Bindings, DO migrations, cron, ai, services, vars
├── package.json
├── bun.lock
├── tsconfig.json
├── migrations/         # D1 SQL (database: crema-agent) — append-only
│   ├── 0001_init.sql
│   ├── 0002_seed.sql
│   ├── 0003_research.sql
│   └── 0004_site_adapters.sql
├── src/
│   ├── index.ts            # OpenAPIHono router: /health, /dev/token, /agents/:repId/*,
│   │                       #                     /v1/*, /docs, /openapi.json
│   ├── auth.ts             # jose-based HS256 sign/verify + `requireRep` (Bearer header)
│   ├── rep-id.ts           # UUIDv4-or-lowercased-email validator (+ dev `rep_demo` carve-out)
│   ├── agent.ts            # RepAgent: extends AIChatAgent, daily-summary cron
│   ├── agent-tools.ts      # 9-tool catalog wired against /v1/*
│   ├── agent-prompts.ts    # SYSTEM_PROMPT + DAILY_SUMMARY_PROMPT + RESEARCH_SYSTEM_PROMPT
│   ├── osint-tools.ts      # Inner-loop research tools: webSearch, fetchUrl, saveAffinities
│   ├── coach-personas.ts   # Coach persona prompts (Gary Vee, Cardone, etc.)
│   ├── rep-extension.ts    # RepExtension DO — WS broker for the Chrome extension
│   ├── customer-stream.ts  # CustomerStream DO — per-customer SSE topic
│   ├── mcp.ts              # MCP server (streamable-http + SSE)
│   ├── cron.ts             # 13:00 UTC daily-summary fan-out
│   ├── db.ts               # D1 query helpers (against the `crema-agent` D1)
│   ├── events.ts           # Event-type union shared with the extension via shared/
│   ├── identity.ts         # KV-backed anonymous_id / email → customer_id resolution
│   ├── llm.ts              # Provider abstraction (workers-ai / openrouter)
│   ├── site-adapters.ts    # Site-adapter selector ladder used by the extension
│   └── routes/             # /v1/* CRM-shaped API the copilot calls into
└── test/
    ├── e2e.ts              # Runner: spawns wrangler dev, waits for /health, asserts
    ├── unit.test.ts        # node:test against unstable_dev (offline queue, close codes)
    └── …
```

## Bindings (`backend/wrangler.toml`)

| Binding            | Type             | What it is                                                                                             |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------------------------ |
| `AGENT`            | Durable Object   | `RepAgent` class — one instance per `sales_rep_id` (the AI copilot)                                    |
| `MCP_AGENT`        | Durable Object   | `RepMcp` class — MCP server endpoint, one instance per rep                                             |
| `REP_EXT`          | Durable Object   | `RepExtension` class — outbound WSS broker to the Chrome extension                                     |
| `CUSTOMER_STREAM`  | Durable Object   | `CustomerStream` class — per-customer SSE fan-out                                                      |
| `DB`               | D1 database      | `crema-agent` (agent-side state: chat history persistence, research jobs, site-adapter snapshots)      |
| `IDENTITY`         | KV namespace     | Identity-resolution cache: `alias:email:<addr>` / `alias:anonymous_id:<id>` / `alias:user_id:<uid>` → `customer_id` |
| `AI`               | Workers AI       | Workers AI binding (zero-secret LLM fallback)                                                          |
| `SELF`             | Service binding  | The Worker calling itself in-process — used by `agent-tools.ts` so tool calls don't take a public-net hop |

DO migration tags are pinned in `wrangler.toml`:

```toml
[[migrations]] tag = "v1"  new_sqlite_classes = ["RepAgent"]
[[migrations]] tag = "v2"  new_sqlite_classes = ["RepMcp"]
[[migrations]] tag = "v3"  new_sqlite_classes = ["RepExtension"]
[[migrations]] tag = "v4"  new_sqlite_classes = ["CustomerStream"]
```

Never edit an applied migration tag; add a new `[[migrations]]` block.

## Secrets (`wrangler secret put NAME`)

| Secret                  | Required | What it's for                                                                                |
| ----------------------- | -------- | -------------------------------------------------------------------------------------------- |
| `JWT_SIGNING_KEY`       | Yes      | HS256 key used to sign and verify per-rep JWTs. **Must be the same value as on `ctv-crm`** — the CRM worker mints; the agent worker verifies. Rotate both at once. |
| `OPENROUTER_API_KEY`    | If using OpenRouter | OpenRouter API key (default LLM provider).                                            |
| `AI_GATEWAY_ACCOUNT_ID` | If using AI Gateway | Cloudflare account ID for the AI Gateway proxy URL.                                   |
| `TAVILY_API_KEY`        | No       | Tavily search API key for the OSINT research loop. Falls back to DuckDuckGo HTML scrape if unset. |

There are **no OAuth client secrets in this Worker** — auth (sign-up / sign-in / sessions) lives on the CRM worker. This Worker only *verifies* JWTs it didn't mint.

## Env vars (`[vars]` in `wrangler.toml`, non-secret)

| Var                  | Default                                                                        | Purpose                                                                            |
| -------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `ENVIRONMENT`        | unset (set to `"dev"` in `.dev.vars`)                                          | When `"dev"`: exposes `POST /dev/token`, allows `?token=dev` → `rep_demo`.         |
| `AGENT_LLM_PROVIDER` | `"openrouter"`                                                                 | `"openrouter"` (default) or `"workers-ai"`.                                        |
| `AI_GATEWAY_ID`      | `"crema-sales-agent"`                                                          | Cloudflare AI Gateway slug; required for the AI Gateway proxy.                     |
| `WORKERS_AI_MODEL`   | `@cf/meta/llama-3.3-70b-instruct-fp8-fast`                                     | Model used when `AGENT_LLM_PROVIDER="workers-ai"`.                                 |
| `INTERNAL_API_BASE`  | `""`                                                                           | Fallback origin when `env.SELF` is unbound (mostly older wrangler-dev sessions).   |
| `UI_ORIGIN`          | `"https://cremasales.com,https://www.cremasales.com,…,http://localhost:5173"`  | Comma-separated allowlist for CORS (REST) and WS Origin checks. Must include every host the frontend deploys to. |

For local dev, `wrangler dev` reads `backend/.dev.vars` (gitignored). Start from `backend/.dev.vars.example`.

## Routing

We use [OpenAPIHono](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) — Hono + Zod + auto-generated OpenAPI 3.1 doc at `/openapi.json`. One file per resource under `src/routes/`; `src/index.ts` is the entry. WS upgrade for `/v1/agent?token=<jwt>` and `/agents/:repId/ws?token=<jwt>` is handled before the OpenAPI route table.

Middleware chain: `request-id → CORS (UI_ORIGIN allowlist) → requireRep (Bearer JWT)`. Errors return `{ error: { code, message, details } }` as documented in [`AGENTS-API.md`](./AGENTS-API.md).

## Cron triggers

```toml
[triggers]
crons = ["0 13 * * *"]   # 13:00 UTC = 08:00 CST / 09:00 CDT — Morning Cup fan-out
```

`src/cron.ts` `scheduled()` handler:

1. Enumerate active reps (today: hard-coded demo list; production should pull from the CRM worker).
2. For each, fetch into `env.AGENT.get(env.AGENT.idFromName(repId)).fetch('/cron/daily')`.
3. The DO generates the rep's summary, stores it under `daily_summary:YYYY-MM-DD` in DO storage. UI renders the latest via `GET /v1/me/summary/today`.

Cron does not fire locally. Trigger manually with the dev-only test paths in `test/` if needed.

## D1 migrations

```
backend/migrations/
├── 0001_init.sql            # base agent-side tables
├── 0002_seed.sql            # demo data (all @cremasales.example — RFC-reserved)
├── 0003_research.sql        # research_jobs table for the OSINT inner loop
└── 0004_site_adapters.sql   # site_adapter_snapshots for the Chrome extension
```

Apply locally: `bunx wrangler d1 migrations apply crema-agent --local`. Apply to prod: `bunx wrangler d1 migrations apply crema-agent --remote`. Never edit an applied migration; add a new one.

The D1 database is provisioned via `bunx wrangler d1 create crema-agent`; the resulting `database_id` lives in `wrangler.toml`.

## Local dev

```bash
cd backend
cp .dev.vars.example .dev.vars             # fill in OPENROUTER_API_KEY, TAVILY_API_KEY, etc.
bun install
bunx wrangler d1 migrations apply crema-agent --local
bun run dev                                # wrangler dev on :8787
```

While in dev (`ENVIRONMENT=dev`), `POST /dev/token` mints an 8h HS256 JWT for arbitrary `repId`, and `?token=dev` is shorthand for the `rep_demo` rep. Production strips both paths.

## Deploy

```bash
cd backend
bun run deploy                                       # wrangler deploy
bunx wrangler d1 migrations apply crema-agent --remote   # only if a new migration was added
```

On success Wrangler prints the canonical URL: `https://ctrl-alt-elite-agent.<account-subdomain>.workers.dev` (currently `smashlabs.workers.dev`). Verify post-deploy:

```bash
curl -sS https://ctrl-alt-elite-agent.smashlabs.workers.dev/health
# → {"ok":true,"version":"0.1.0","phase":"agentic-foundation"}
```

The frontend's `wrangler.jsonc` and the extension's `validate.ts` allowlist both depend on this exact URL. If you move the Worker to a different zone, update those two places.

## Observability

- `bunx wrangler tail ctrl-alt-elite-agent --format pretty` — live logs.
- `[observability] enabled = true` is in `wrangler.toml`, so traces appear in the Cloudflare dashboard.
- Every request gets a `request_id` via middleware; every log line includes it. The response carries it on `x-request-id`. Correlate API ↔ DO ↔ tool chains by grepping the id.

## Identity resolution (KV-backed)

The `IDENTITY` KV holds three alias key shapes pointing at a canonical `customer_id`:

- `alias:email:<addr>` → `customer_id`
- `alias:anonymous_id:<id>` → `customer_id`
- `alias:user_id:<uid>` → `customer_id`

The CRM worker's public ingest path (`POST /api/public/ingest`) is the primary writer; this agent worker exposes a lower-level `POST /v1/ingest` and `GET /v1/pixel` for cross-property tracking that bypass the CRM worker's HMAC envelope. `src/identity.ts` is the single owner of merge logic — never read/write alias keys from anywhere else.

## Outbound webhooks — *not in this Worker*

Org-level outbound webhook fan-out lives on the CRM worker (`frontend/src/lib/webhooks/`), fires via `ctx.waitUntil` on the same request that wrote the row, and logs deliveries in the CRM's D1. There is no Cloudflare Queue for webhooks in this repo. See [`AGENTS-WEBHOOKS.md`](./AGENTS-WEBHOOKS.md) for the full architecture.

## What does NOT live in this layer

- **The HTTP contract** — see [`AGENTS-API.md`](./AGENTS-API.md).
- **The copilot persona, tool definitions, scheduled summary prompt, OSINT inner loop** — see [`AGENTS-AGENTS.md`](./AGENTS-AGENTS.md).
- **Auth (sign-up / sign-in / cookies / sessions)** — that's all on the CRM worker (`frontend/src/auth/`). This Worker only verifies bearer JWTs minted there.
- **The React app, the CRM D1 (`ctv_crm`), outbound webhooks, the Resend integration** — all on the CRM worker. See [`AGENTS-DEVOPS.md`](./AGENTS-DEVOPS.md).
