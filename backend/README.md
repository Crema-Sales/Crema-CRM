# ctrl-alt-elite Agent Backend

Cloudflare Worker that hosts two per-rep Durable Object surfaces:

1. **`RepAgent`** (binding `AGENT`, class extends `AIChatAgent`) — the rep's AI chat copilot. WS upgrade on `/v1/agent?token=<jwt>`. Provider abstraction in `src/llm.ts` (Workers AI / OpenRouter via AI Gateway). 9-tool catalog in `src/agent-tools.ts`. Self-call topology via the `SELF` service binding into `/v1/*`.
2. **`RepExtension`** (binding `REP_EXT`, class extends `DurableObject`) — the WS broker between the agent control plane and the rep's MV3 browser extension. Hibernating outbound WSS at `/agents/:repId/ws`, persisted offline FIFO command queue with 24h TTL, command dispatch on `POST /agents/:repId/act`, status on `GET /agents/:repId/status`.

Both DOs are keyed by `idFromName(repId)` so they're logically the same rep, just different processes. The wire contract for the extension broker lives in [`shared/agent-ws-protocol.md`](../shared/agent-ws-protocol.md).

## Layout

```
backend/
├── src/
│   ├── index.ts          # OpenAPIHono router: /health, /dev/token, /agents/:repId/*, /v1/*, /docs, /openapi.json
│   ├── auth.ts           # jose-based HS256 sign/verify + `requireRep` (Bearer header)
│   ├── rep-id.ts         # UUIDv4-or-lowercased-email validator (+ dev `rep_demo` carve-out)
│   ├── agent.ts          # RepAgent: AIChatAgent copilot, daily summary cron
│   ├── rep-extension.ts  # RepExtension: WS broker, queue, drain, ping/pong auto-response
│   ├── agent-prompts.ts  # SYSTEM_PROMPT + DAILY_SUMMARY_PROMPT
│   ├── agent-tools.ts    # 9-tool catalog wired against `/v1/*`
│   ├── llm.ts            # provider abstraction (workers-ai / openrouter)
│   ├── mcp.ts            # MCP server (streamable-http + SSE)
│   ├── cron.ts           # 13:00 UTC daily-summary fan-out
│   ├── seed.ts
│   └── routes/           # /v1/* CRM API: me, customers, leads, tickets, actions
├── wrangler.toml         # Worker + DO bindings (AGENT, REP_EXT, MCP_AGENT) + cron + ai + SELF
├── package.json
└── tsconfig.json
```

## Environment variables

| Name                    | Where set                                | Required | Purpose                                                                                    |
| ----------------------- | ---------------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `JWT_SIGNING_KEY`       | Cloudflare secret (`wrangler secret`)    | Yes      | HS256 key used to sign and verify the per-rep JWT (Bearer on HTTP, `?token=` on WS).       |
| `ENVIRONMENT`           | `[vars]` / `.dev.vars`                   | No       | When equal to `"dev"`: exposes `POST /dev/token`, allows `?token=dev` → `rep_demo`.        |
| `AGENT_LLM_PROVIDER`    | `[vars]`                                 | No       | `"workers-ai"` (default) or `"openrouter"`.                                                |
| `AI_GATEWAY_ID`         | `[vars]`                                 | No       | Cloudflare AI Gateway slug; required for the AI Gateway proxy.                             |
| `AI_GATEWAY_ACCOUNT_ID` | Cloudflare secret                        | No       | Cloudflare account ID for the AI Gateway URL.                                              |
| `WORKERS_AI_MODEL`      | `[vars]`                                 | No       | Default model when `AGENT_LLM_PROVIDER="workers-ai"`.                                      |
| `OPENROUTER_API_KEY`    | Cloudflare secret                        | No       | Required only when `AGENT_LLM_PROVIDER="openrouter"`.                                      |
| `INTERNAL_API_BASE`     | `[vars]`                                 | No       | Fallback origin when `env.SELF` is unbound (mostly older wrangler-dev sessions).           |

For local dev, `wrangler dev` reads `backend/.dev.vars` (gitignored). Start from `.dev.vars.example`.

## Commands

| Command              | What it does                                                |
| -------------------- | ----------------------------------------------------------- |
| `bun run dev`        | `wrangler dev` on `http://localhost:8787`.                  |
| `bun run typecheck`  | `tsc --noEmit` against `src/`.                              |
| `bun run test`       | Offline-queue + WS close-code unit tests (`node:test` against `unstable_dev`). |
| `bun run test:e2e`   | Spawns `wrangler dev`, waits for `/health`, runs `test/e2e.ts`, tears down.    |
| `bun run test:mock`  | Manual smoke against a running `wrangler dev`: opens a mock WS, posts `/act`, asserts the echo. |
| `bun run test:ping`  | Manual probe against a running `wrangler dev`: verifies the hibernation ping/pong auto-response. |
| `bun run deploy`     | `wrangler deploy` to Cloudflare. Secrets must already be set. |

> The e2e runner intentionally executes under Node, not Bun. Wrangler / workerd's local proxy faults with `setsocketopt(TCP_NODELAY): Invalid argument` when spawned from a Bun parent; running the orchestrator under `node --experimental-strip-types` avoids it.

## Public surface (HTTP)

| Method | Path                          | Auth                                       | Notes                                                                                            |
| ------ | ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| GET    | `/health`                     | none                                       | Liveness probe.                                                                                  |
| POST   | `/dev/token`                  | none (gated by `ENVIRONMENT=dev`)          | Mints an 8h HS256 JWT. Body: `{repId, email?}`. `repId` must be UUIDv4 or lowercased email.      |
| GET    | `/agents/:repId/ws`           | `?token=<jwt>` (JWT `sub` must equal `:repId`) | WebSocket upgrade to the `RepExtension` DO. Terminal failures surface as close codes (below).    |
| GET    | `/agents/:repId/status`       | Bearer JWT                                 | `{online, enabled, queueDepth}` from the DO.                                                     |
| POST   | `/agents/:repId/act`          | Bearer JWT                                 | Dispatch a command. Body: `{type, params}`. Returns sync result (≤30s) or `{queued, id}`.        |
| WSS    | `/v1/agent?token=<jwt>`       | `?token=<jwt>`                             | Chat copilot WebSocket (`RepAgent`).                                                             |
| GET    | `/docs`                       | none                                       | Scalar-rendered OpenAPI viewer.                                                                  |
| GET    | `/openapi.json`               | none                                       | OpenAPI 3.1 schema for the `/v1/*` CRM API.                                                      |
| GET    | `/v1/*`                       | Bearer JWT                                 | CRM API (me, customers, leads, tickets, actions).                                                |

### Terminal WebSocket close codes on `/agents/:repId/ws`

The extension's reconnect logic uses these to distinguish unrecoverable auth failures from transient drops:

- **`4400 invalid_rep_id`** — `:repId` does not match `^[uuidv4]$` or a lowercased email.
- **`4401 unauthorized`** — JWT missing, malformed, expired, or `sub` does not match `:repId`.
- **`4403 forbidden`** — reserved for server-initiated ban (not currently emitted).

Codes ≥4000 are *application* close codes (the upgrade succeeds, the close follows immediately). The extension can read `event.code` in `onclose` and stop retrying when it sees one of these.

## Deploying

First-time deploy (or after rotating the secret):

```bash
# 1. Authenticate wrangler against the target Cloudflare account.
wrangler login

# 2. Set the HS256 JWT signing key on the deployed Worker. Paste a 32+ byte
#    random string (e.g. `openssl rand -hex 32`).
wrangler secret put JWT_SIGNING_KEY

# 3. (Optional) confirm the secret was set:
wrangler secret list

# 4. Deploy. Wrangler will print the canonical URL on success.
bun run deploy
```

Subsequent deploys are just `bun run deploy` — secrets persist across deploys.

### Canonical URL

The Worker is named `ctrl-alt-elite-agent` (`wrangler.toml`). On the default `workers.dev` zone:

```
https://ctrl-alt-elite-agent.<account-subdomain>.workers.dev
```

The frontend / extension allowlist constants point here. Verify post-deploy:

```bash
curl https://<deployed>/health     # → {"ok":true,"version":"0.1.0","phase":"agentic-foundation"}
```
