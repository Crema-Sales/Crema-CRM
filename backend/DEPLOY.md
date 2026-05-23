# backend DEPLOY runbook — `ctrl-alt-elite-agent`

Worker name: `ctrl-alt-elite-agent`. URL: https://ctrl-alt-elite-agent.smashlabs.workers.dev. Cloudflare account: SMASHLabs (`3d54c4e78ef091055ec6772b991ee95e`).

## Prereqs (one-time)

```bash
bunx wrangler whoami   # must show SMASHLabs
bunx wrangler secret list   # expect: JWT_SIGNING_KEY, AI_GATEWAY_ACCOUNT_ID, SUPABASE_PROJECT_REF
```

If a secret is missing, set it:

```bash
bunx wrangler secret put JWT_SIGNING_KEY       # must match frontend's JWT_SECRET
bunx wrangler secret put AI_GATEWAY_ACCOUNT_ID # SMASHLabs account id
bunx wrangler secret put OPENROUTER_API_KEY    # only if AGENT_LLM_PROVIDER="openrouter"
```

**Critical:** `JWT_SIGNING_KEY` here MUST equal `JWT_SECRET` on the `ctv-crm` Worker. The chat WS authenticates the `ctv_auth` cookie's JWT directly using this shared key. Mismatch → every chat connection closes with 1008 unauthorized.

## Deploy

```bash
cd backend
bunx wrangler deploy
```

URL stays `https://ctrl-alt-elite-agent.smashlabs.workers.dev`.

## Smoke (60s)

```bash
URL=https://ctrl-alt-elite-agent.smashlabs.workers.dev
curl -s $URL/health | jq                                    # {ok:true,...}
curl -s $URL/openapi.json | jq .info.title                  # "Crema Sales Agent API"
curl -s -o /dev/null -w "%{http_code}\n" $URL/docs          # 200
curl -s -w "\n%{http_code}\n" $URL/v1/customers             # 401 (auth gate live)
```

## CORS

The chat WS rejects cross-origin upgrades from non-allowlisted origins (403). The REST routes return CORS-blocked preflights. Allowlist lives in `wrangler.toml [vars] UI_ORIGIN` (comma-separated). To add an origin: edit `UI_ORIGIN`, redeploy.

If the chat fails on shoot day with a CORS error or `1008 unauthorized`:
1. Check `UI_ORIGIN` includes the live frontend origin.
2. Check `JWT_SIGNING_KEY` matches the frontend's `JWT_SECRET`.

## Rollback

```bash
bunx wrangler rollback
```

Cron triggers (Morning Cup fan-out, 13:00 UTC daily) fire on the rolled-back version on next firing. No D1 to migrate back — RepAgent state lives in DO storage and survives rollback.

## Known issues

(none currently — the prior `/__cron/daily` gate bug was fixed; the route is now gated `ENVIRONMENT === "dev"`, set only in `backend/.dev.vars`.)
