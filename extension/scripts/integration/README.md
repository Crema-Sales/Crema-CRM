# Integration smoke tests

Standalone scripts to validate the deployed backend (`ctrl-alt-elite-agent` Worker + `RepAgent` Durable Object) without loading the Chrome extension.

## Setup

```bash
bun install                            # one-time
export AGENT_BASE_URL="http://localhost:8787"   # or the deployed URL
```

## Run

Individual scripts:

```bash
bun run test:health
bun run test:mint   test-rep
bun run test:status test-rep
bun run test:ws     test-rep
bun run test:act    test-rep
```

End-to-end:

```bash
bun run test:integration test-rep
```

Equivalently:

```bash
AGENT_BASE_URL=https://ctrl-alt-elite-agent.workers.dev \
  bun run scripts/integration/run-all.ts test-rep
```

## What each script does

| Script | Validates |
|---|---|
| `health-check.ts` | `GET /health` returns 200 `{ok:true,...}` |
| `mint-token.ts` | `POST /dev/token` mints + caches a JWT under `scripts/integration/.tokens/<repId>.json` |
| `status-check.ts` | `GET /agents/:repId/status` returns `{online, enabled, queueDepth}` with `Authorization: Bearer <jwt>` |
| `ws-smoke.ts` | WSS upgrade, `online`+`ping`/`pong` (hibernation pair), `toggle`, clean 1000 close |
| `act-roundtrip.ts` | Opens a WS posing as the rep extension, POSTs `/act`, replies with a synthetic ack, asserts the `/act` HTTP response carries the synthetic `result` back |

## `.tokens/` is gitignored

JWTs minted by `mint-token.ts` are cached on disk so the other scripts can pick them up. The `.tokens/` directory is gitignored — never check tokens into source.

## Production note

`/dev/token` is gated to `ENVIRONMENT=dev` on the Worker. Pointing these scripts at a production deploy will fail at the `mint-token` step. To smoke-test prod, mint a token through the real cremasales.com login flow and seed `scripts/integration/.tokens/<repId>.json` manually:

```json
{ "token": "<real JWT here>", "repId": "rep-uuid", "savedAt": 0 }
```
