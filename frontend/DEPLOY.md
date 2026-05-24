# frontend DEPLOY runbook — `ctv-crm`

Worker name: `ctv-crm`. URL: https://ctv-crm.smashlabs.workers.dev. Cloudflare account: SMASHLabs. D1 database: `ctv_crm` (`f89d74c8-f8ea-4cc5-8673-7cc14c8fcb50`). Full architecture context in `../AGENTS-DEVOPS.md`.

## Prereqs (one-time)

```bash
bunx wrangler whoami   # must show SMASHLabs
bunx wrangler secret list   # expect: JWT_SECRET, INGEST_WEBHOOK_SECRET, RESEND_API_KEY
```

If `JWT_SECRET` is missing or you're rotating it:

```bash
JWT=$(openssl rand -hex 32)
printf "%s" "$JWT" | bunx wrangler secret put JWT_SECRET
# Then immediately mirror to the backend so the chat WS keeps working:
cd ../backend
printf "%s" "$JWT" | bunx wrangler secret put JWT_SIGNING_KEY
cd -
```

**Critical:** `JWT_SECRET` here MUST equal `JWT_SIGNING_KEY` on the `ctrl-alt-elite-agent` Worker. The chat WS authenticates the `ctv_auth` cookie's JWT directly using this shared key. Mismatch → every chat connection closes with 1008 unauthorized.

## Deploy

```bash
cd frontend
bun run deploy   # = vite build && wrangler deploy
```

URL stays `https://ctv-crm.smashlabs.workers.dev`.

## Optional: `COACH_AGENT_URL` override

`POST /api/v1/coach/chat` proxies to the backend agent Worker. The default target is `https://ctrl-alt-elite-agent.smashlabs.workers.dev` — if the backend ever moves, override via `wrangler secret put COACH_AGENT_URL` (or add to `[vars]` in `wrangler.jsonc` for non-secret values). Local dev: set it in `.dev.vars` to point at `http://localhost:8787`.

## Smoke (60s)

1. Open the URL in a browser.
2. Sign in.
3. Click the bubble (bottom-right), AI tab, type *"what should I work on this morning?"*.
4. Confirm: streaming text reply, inline `🛠 calling prioritizedActions` annotation, customer ids from the seed appear in the body.
5. DevTools → Network → WS filter: exactly one open WebSocket to `wss://ctrl-alt-elite-agent.smashlabs.workers.dev/v1/agent?token=...`, status 101.

## Troubleshooting the chat

| Symptom | Likely cause | Fix |
|---|---|---|
| Bubble shows but "Sign in again — copilot can't verify your session" | `ctv_auth` cookie missing/expired | Sign out and back in |
| Chat closes immediately, no reply | `JWT_SECRET` ↔ `JWT_SIGNING_KEY` mismatch | Re-mirror via the prereq script above |
| Chat fails with CORS in console | Backend `UI_ORIGIN` doesn't include this origin | Edit `../backend/wrangler.toml [vars] UI_ORIGIN`, redeploy backend |
| No streaming, "websocket error" | Backend down or network | Check `../backend/DEPLOY.md` smoke |

## Rollback

```bash
bunx wrangler rollback
```

D1 schema is forward-compatible — rolling the Worker back does not require a migration revert. Coordinate frontend/backend rollback if a deploy bumped both.
