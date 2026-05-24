# AGENTS-DEVOPS.md — Cloudflare Deploy

How we deploy the **`frontend/`** TanStack Start + D1 app to Cloudflare Workers. Single-tenant by default; multi-tenant via per-org partitioning in D1.

**Worker name:** `ctv-crm` (rename in `wrangler.jsonc` to match your deployment)
**D1 database:** `ctv_crm` (create your own; see [First-time setup](#first-time-setup-already-done---for-reference))

## Day-to-day workflow (the only two commands you need)

```bash
# After ANY change to frontend/ that's merged to main:
cd frontend && bun run deploy
# expands to: vite build && wrangler deploy
# URL stays the same: https://ctv-crm.smashlabs.workers.dev
```

```bash
# Local dev (HMR + local D1, no prod data touched):
cd frontend && ./run-local.sh
# → http://localhost:5173
```

The rule is: **push to `main` → run `bun run deploy` from `frontend/`**. Cloudflare doesn't auto-deploy on git push — Wrangler does, when you run it. If multiple agents/humans push back-to-back, the last deploy wins; coordinate accordingly.

### CI deploy (optional)

A GitHub Action on `push: main` that runs `bun run deploy` is a clean upgrade path. The auth is a `CLOUDFLARE_API_TOKEN` repo secret. Not wired by default.

## Architecture choices

- **D1 SQLite, no RLS.** Ownership and org isolation are enforced in `src/lib/crm.functions.ts`, not at the database layer. Every CRM query filters by `org_id` and (where relevant) `owner_id`.
- **Email + password auth, HS256 JWT cookie.** PBKDF2-hashed passwords (Web Crypto, no deps). The cookie name is `ctv_auth`. OAuth providers are not wired in v1 — see [`AGENTS.md`](./AGENTS.md) for the auth surface.
- **Polling for realtime, not WebSockets.** Tickets page polls every 15s (`refetchInterval`). The DO copilot uses SSE for per-customer event streams (see [`AGENTS-AGENTS.md`](./AGENTS-AGENTS.md)); the CRM UI does not.
- **SLA sweep is an HTTP-triggered server-fn.** `src/routes/api/public/hooks/sla-sweep.ts` — schedule it via Cron Triggers or an external pinger. `Authorization: Bearer <INGEST_WEBHOOK_SECRET>`.
- **Inline business logic, not DB triggers.** `slaDueAt`, `seedStageTasks`, `maybeAdvanceStage` live in `crm.functions.ts`. Easier to read, type, and step through than Postgres triggers.

## Repo layout (the parts you'll touch)

```
frontend/
├── migrations/0001_init.sql          D1 SQLite schema (ported from Postgres)
├── src/
│   ├── auth/
│   │   ├── crypto.ts                 PBKDF2 + JWT via Web Crypto (no deps)
│   │   ├── middleware.ts             requireAuth — CLIENT-SAFE (dynamic imports inside .server())
│   │   ├── cookies.server.ts         readAuthCookie / buildAuthCookie / authPayloadFromCookieHeader
│   │   └── server-fns.ts             signUp / signIn / signOut / getSession
│   ├── db/env.server.ts              CloudflareEnv type + AsyncLocalStorage shim (getDB, getEnv)
│   ├── lib/crm.functions.ts          ALL CRM server fns (rewritten for D1, no RLS)
│   ├── routes/                       file-based routes (no Supabase imports anywhere)
│   ├── server.ts                     Worker fetch handler — wraps requests in runWithEnv
│   └── start.ts                      TanStack Start middleware (no auth attacher needed — cookies are automatic)
├── wrangler.jsonc                    Worker config (D1 binding + nodejs_compat)
├── .env.example                      What to put in .dev.vars for local dev
└── package.json                      No @supabase/* or @lovable.dev/*
```

**Key architectural choice — the `*.server.ts` suffix.** TanStack Start's bundler ships `crm.functions.ts` to both client and server (the client needs the call shape; bodies are stripped). Any top-level import in those files that pulls in `node:async_hooks`, D1 bindings, or env secrets will break the client build. So:

- Server-only code lives in `*.server.ts` files (`db/env.server.ts`, `auth/cookies.server.ts`). TanStack's `import-protection` plugin refuses to import these from client modules.
- `auth/middleware.ts` is **client-safe** — it dynamically imports `@/db/env.server`, `./crypto`, and `@tanstack/react-start/server` inside the `.server()` callback. This lets `requireAuth` be referenced by `.middleware([requireAuth])` chains in `crm.functions.ts` without leaking server-only code into the client.

If you see `[import-protection] Import denied in client environment` at build time, move the offending top-level import to a `.server.ts` file or lazy-import it inside a `.server()` body.

## First-time setup (already done — for reference)

```bash
cd frontend
bun install

# 1. Create the D1 database
bunx wrangler d1 create ctv_crm
# Copy the database_id into wrangler.jsonc

# 2. Apply schema
bunx wrangler d1 migrations apply ctv_crm --remote

# 3. Generate + upload secrets (stdin so they never touch disk in plaintext)
JWT=$(openssl rand -hex 32)
INGEST=$(openssl rand -hex 32)
printf "%s" "$JWT"    | bunx wrangler secret put JWT_SECRET
printf "%s" "$INGEST" | bunx wrangler secret put INGEST_WEBHOOK_SECRET

# 4. Build + deploy
bun run deploy   # = vite build && wrangler deploy
```

## Day-to-day deploy

```bash
cd frontend
bun run deploy
```

That's it. `bun run deploy` = `vite build && wrangler deploy`. The Worker URL won't change.

**Before every deploy, also check:**

- A new **migration** was added → run `bun run db:apply:remote` first (see [Schema changes](#schema-changes)). Code that references a missing column 500s with `no such column` until the migration lands.
- A new **extension build** shipped → CI auto-commits the refreshed zip into `frontend/public/downloads/crema-agent-latest.zip`, but a frontend `bun run deploy` is still needed to actually publish it (see [Extension binary refresh](#extension-binary-refresh)). The bundled zip is what reps actually download from `/settings → Extension`.

## Local dev

```bash
cd frontend
./run-local.sh           # bootstrap + run on http://localhost:5173
```

`run-local.sh` is idempotent. On every invocation it:

1. Installs deps if `node_modules/` is missing.
2. Generates `.dev.vars` with random local-only `JWT_SECRET` + `INGEST_WEBHOOK_SECRET` if missing (gitignored, never touches prod).
3. Applies pending migrations to local D1 in `.wrangler/state/` (Wrangler tracks applied migrations — re-running is a no-op).
4. Starts `bun dev` (Vite + `@cloudflare/vite-plugin`, which wires the local D1 binding so server fns work just like prod).

Flags:

- `./run-local.sh --reset` — wipe `.wrangler/state/` (local D1) and re-apply migrations from scratch. Use when you want a fresh empty database.
- `./run-local.sh --no-dev` — run only the bootstrap steps, don't start the dev server. Useful for CI smoke checks.

Local DB ≠ prod DB. The `.wrangler/state/` directory is your isolated dev sandbox. Production data lives in the remote D1 (`bun run db:apply:remote` to push schema there). Nothing you do locally is visible online.

### Inspecting local DB

```bash
# Query local D1
bunx wrangler d1 execute ctv_crm --local --command "SELECT email, role FROM users;"

# Wipe everything and start over
./run-local.sh --reset
```

### When you change the schema on a branch

1. Add a new file under `migrations/` (e.g. `0002_add_thing.sql`).
2. Re-run `./run-local.sh` — it applies the new migration locally and starts dev.
3. After the PR merges and you run `bun run deploy`, also run `bun run db:apply:remote` to push the migration to prod D1.

## Schema changes

1. Add a new file under `migrations/`, lexicographically after the latest (e.g. `0002_add_column.sql`).
2. Test locally: `bun run db:apply:local`.
3. Push to prod: `bun run db:apply:remote` — **before** `bun run deploy`. Code that references a missing column 500s with `no such column` until the migration lands.

D1 supports `ALTER TABLE ADD COLUMN`, `CREATE INDEX`, etc. — but not `DROP COLUMN` / `RENAME COLUMN` in older versions, so prefer additive changes. If you must restructure, write a multi-step migration (new table, copy, drop, rename) in a single file.

## Extension binary refresh

The Chrome extension ships bundled in the repo at `frontend/public/downloads/crema-agent-latest.zip`. Cloudflare's assets binding serves it at `/downloads/crema-agent-latest.zip` on whichever domain you've attached — that's the URL `/settings → Extension` links to.

The extension source lives at `extension/` in this same monorepo. The `Release Extension` GitHub Actions workflow (`.github/workflows/extension-release.yml`) builds and zips on every push to `main` that touches `extension/**` or `shared/**`, publishes a GitHub Release, **and auto-commits the same zip back into `frontend/public/downloads/crema-agent-latest.zip`** with a `chore(extension): sync <tag> into frontend downloads [skip ci]` message. The commit-back doesn't re-trigger the workflow (path filter excludes `frontend/**`), so there's no loop.

So in steady state, after an extension change lands on `main` the only manual step is the frontend deploy:

```bash
# Pull the auto-commit CI just pushed
git pull --ff-only origin main

# Sanity-check the bundled zip matches the release you expect
unzip -p frontend/public/downloads/crema-agent-latest.zip manifest.json | grep version

# Ship it
cd frontend && bun run deploy
```

If CI ever fails to auto-commit (e.g. the push race-loses to a concurrent commit on `main`), the release is still published — pull the asset down manually and commit it yourself:

```bash
gh release download <tag> -p crema-agent-latest.zip \
  -O frontend/public/downloads/crema-agent-latest.zip
git add frontend/public/downloads/crema-agent-latest.zip
git commit -m "chore(extension): sync <tag> into frontend downloads"
git push origin HEAD:main
cd frontend && bun run deploy
```

Filename stays `crema-agent-latest.zip` on every release so the public URL never changes. The release tag is in the auto-commit's message — that's the only place the version is tracked in this tree, since the file is opaque.

## Secret rotation

```bash
# Rotate JWT (invalidates ALL existing sessions — users have to log back in)
printf "%s" "$(openssl rand -hex 32)" | bunx wrangler secret put JWT_SECRET
bun run deploy   # not strictly needed but ensures fresh deploy

# Rotate ingest secret (callers of /api/public/ingest need the new value)
printf "%s" "$(openssl rand -hex 32)" | bunx wrangler secret put INGEST_WEBHOOK_SECRET
```

## Inspecting prod data

```bash
# One-off query
bunx wrangler d1 execute ctv_crm --remote --command "SELECT count(*) FROM users;"

# Open an interactive shell-ish
bunx wrangler d1 execute ctv_crm --remote --command ".schema"

# Streaming logs
bunx wrangler tail ctv-crm --format pretty
```

## Endpoints worth knowing

- `GET /login` — sign-in / sign-up form
- `GET /funnel`, `/today`, `/relationships`, `/companies`, `/tickets`, `/activity`, `/settings` — authed app (redirects to `/login` if no session)
- `POST /api/public/ingest` — cross-property ingest webhook. HMAC-SHA256 the raw body with `INGEST_WEBHOOK_SECRET`, send as `x-signature: <hex>`.
- `POST /api/public/hooks/sla-sweep` — SLA escalation cron hook. `Authorization: Bearer <INGEST_WEBHOOK_SECRET>`. Call this on a schedule (Cron Trigger or external pinger) to auto-escalate breached tickets.

## Verifying a deploy

```bash
# 1. SSR renders
curl -sS https://ctv-crm.smashlabs.workers.dev/login -o /dev/null -w "HTTP %{http_code}\n"
# expect: HTTP 200

# 2. Worker startup time
bunx wrangler tail ctv-crm --format json &
curl -sS https://ctv-crm.smashlabs.workers.dev/ -o /dev/null
# look for "outcome":"ok" in tail output

# 3. Auth flow (browser)
# Open the URL, click "Create an account", sign up. You should land on /funnel
# with the empty-state. seedDemo runs lazily on dashboard load when there are zero
# contacts — or trigger it manually via the UI.
```

## When the deploy fails

| Symptom | Likely cause | Fix |
|---|---|---|
| `Module "node:async_hooks" has been externalized for browser` | A `.server.ts` file is being imported by a client-reachable module | Move the offending import to a `*.server.ts` file or lazy-import inside `.server()` |
| `Import denied in client environment` | TanStack `import-protection` caught a `.server.*` import in a client chain | Same fix — lazy-import or split |
| `Error: Cloudflare env not available — request not wrapped with runWithEnv` | A server fn ran outside the Worker `fetch` handler | Confirm `src/server.ts` calls `runWithEnv(env, ...)` and that you're hitting the Worker, not running `bun preview` without a binding |
| `Unauthorized` on every server fn | JWT_SECRET mismatch between cookie issuance and verification | You rotated the secret; users need to re-login. Or you have stale `.dev.vars` |
| D1 `no such column` after a migration | Migration didn't apply to remote | `bunx wrangler d1 migrations apply ctv_crm --remote` |
| `SQLITE_CONSTRAINT: CHECK constraint failed` | Sending an enum value not in the CHECK list (e.g. priority other than low/medium/high/urgent) | Fix the caller; `migrations/0001_init.sql` is the canonical enum list |

## Attaching the production domain (tomorrow)

When `cremasales.com` is ready:

1. In Cloudflare dashboard → Workers → `ctv-crm` → Settings → Domains → **Add Custom Domain** → `cremasales.com` (or `app.cremasales.com`).
2. Cloudflare auto-provisions the cert (the domain must already be on Cloudflare DNS).
3. Optionally disable `workers.dev` by adding `"workers_dev": false` to `wrangler.jsonc`.
4. Update any external services that reference the `.workers.dev` URL.

## Cost / quota notes

- D1 free tier: 5GB storage, 5M reads/day, 100k writes/day. Comfortable for early stage and demos.
- Workers free tier: 100k requests/day. Each page view = ~1 Worker request (SSR) + server fn calls.
- For sustained prod traffic, upgrade to Workers Paid ($5/mo) — gives 10M requests/month included and unlimited CPU time per request.

## Known gaps vs `frontend/`

- **No realtime.** Tickets page polls every 15s (search `refetchInterval`); same for support bubble. Upgrade path: Durable Objects + WebSockets.
- **AI features partly stubbed.** `aiBriefing` returns a static string; `scoreLead` runs heuristics only. The standalone agent worker (`backend/`) is the delegation target — wire these to call `/v1/customers/:id/research` and the `RepAgent` DO over WSS as needed.
- **No OAuth providers.** Email/password only. Adding Google/Apple/etc. means wiring an OAuth library or rolling it on top of the existing JWT plumbing.
- **No multi-user role assignment UI.** All sign-ups land as `role='rep'`. Promote to `admin` or `manager` with: `bunx wrangler d1 execute ctv_crm --remote --command "UPDATE users SET role='admin' WHERE email='you@example.com';"`.
