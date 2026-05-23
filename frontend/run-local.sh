#!/usr/bin/env bash
# Bootstrap and run ctv-crm locally.
#
# Idempotent: safe to re-run. Each phase only does work if its outputs are missing.
#
#   ./run-local.sh           — install deps if needed, ensure secrets + local D1
#                              are in place, then `bun dev` on http://localhost:5173
#   ./run-local.sh --reset   — wipe local D1 state and re-seed migrations from scratch
#   ./run-local.sh --no-dev  — bootstrap only, don't start the dev server
#   ./run-local.sh --prod    — point the local dev server at the PRODUCTION D1
#                              (ctv_crm on Cloudflare). Skips local migrations
#                              and the local seed; every read/write hits prod.
#                              Use sparingly — destructive ops in dev now
#                              mutate prod data.
#
# Local DB and local secrets are isolated from production. `.wrangler/state/` is
# the local D1 store; `.dev.vars` holds dev-only secrets. Both are gitignored.
#
# After migrations apply, `seed/prod-snapshot.sql` is loaded (sanitized snapshot
# of prod via `./scripts/seed-from-prod.sh`). Every seeded user has password
# `localdev123`. Inserts use INSERT OR IGNORE so re-running this script is safe.

set -euo pipefail

cd "$(dirname "$0")"

RESET=0
RUN_DEV=1
USE_PROD=0
for arg in "$@"; do
  case "$arg" in
    --reset)  RESET=1 ;;
    --no-dev) RUN_DEV=0 ;;
    --prod)   USE_PROD=1 ;;
    *) echo "Unknown flag: $arg"; exit 2 ;;
  esac
done

note() { printf "\033[1;36m›\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m!\033[0m %s\n" "$*" >&2; }

# 1. Sanity-check toolchain.
for tool in bun openssl; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    warn "$tool not found on PATH. Install it and re-run."
    exit 1
  fi
done

# 2. Install deps if missing.
if [ ! -d node_modules ]; then
  note "Installing dependencies (bun install)…"
  bun install
fi

# 3. Generate .dev.vars with random local secrets if missing.
# These are LOCAL ONLY — production secrets live in `wrangler secret put`.
# RESEND_API_KEY: export it before running this script if you want local
# email send to work (`export RESEND_API_KEY=re_…`). Without it, email-
# dependent features no-op locally. Get a sandbox key from
# https://resend.com/api-keys — never commit a real one.
RESEND_KEY="${RESEND_API_KEY:-}"
if [ -z "$RESEND_KEY" ]; then
  warn "RESEND_API_KEY not set — local email send will be disabled."
fi
if [ ! -f .dev.vars ]; then
  note "Generating .dev.vars with random local secrets…"
  JWT_LOCAL=$(openssl rand -hex 32)
  INGEST_LOCAL=$(openssl rand -hex 32)
  DEV_SMOKE_LOCAL=$(openssl rand -hex 24)
  cat > .dev.vars <<EOF
# Local dev secrets — gitignored, never used in production.
JWT_SECRET=$JWT_LOCAL
INGEST_WEBHOOK_SECRET=$INGEST_LOCAL
RESEND_API_KEY=$RESEND_KEY
DEV_SMOKE_KEY=$DEV_SMOKE_LOCAL
# Override wrangler.jsonc's prod APP_BASE_URL for local dev.
APP_BASE_URL=http://localhost:5173
EOF
else
  # Idempotent: append any keys added by later playbook phases.
  if ! grep -q '^RESEND_API_KEY=' .dev.vars; then
    note "Appending RESEND_API_KEY to existing .dev.vars…"
    echo "RESEND_API_KEY=$RESEND_KEY" >> .dev.vars
  fi
  if ! grep -q '^DEV_SMOKE_KEY=' .dev.vars; then
    note "Appending DEV_SMOKE_KEY to existing .dev.vars…"
    echo "DEV_SMOKE_KEY=$(openssl rand -hex 24)" >> .dev.vars
  fi
  if ! grep -q '^APP_BASE_URL=' .dev.vars; then
    note "Appending APP_BASE_URL override to existing .dev.vars…"
    echo "APP_BASE_URL=http://localhost:5173" >> .dev.vars
  fi
fi

# 3b. Mirror JWT_SECRET into backend/.dev.vars as JWT_SIGNING_KEY so the
# agentic backend's verifyRepJwt accepts the ctv_auth cookie's JWT directly
# (no exchange route needed). Only runs if backend/.dev.vars exists.
BACKEND_VARS="../backend/.dev.vars"
if [ -f "$BACKEND_VARS" ]; then
  CURRENT_JWT=$(grep '^JWT_SECRET=' .dev.vars | head -1 | cut -d= -f2-)
  if [ -n "$CURRENT_JWT" ]; then
    if grep -q '^JWT_SIGNING_KEY=' "$BACKEND_VARS"; then
      if ! grep -q "^JWT_SIGNING_KEY=$CURRENT_JWT$" "$BACKEND_VARS"; then
        note "Syncing JWT_SIGNING_KEY in backend/.dev.vars to match this frontend's JWT_SECRET…"
        # Use a temp file for portable in-place edit (BSD sed differs from GNU).
        awk -v new="JWT_SIGNING_KEY=$CURRENT_JWT" '/^JWT_SIGNING_KEY=/{print new; next}{print}' "$BACKEND_VARS" > "$BACKEND_VARS.tmp"
        mv "$BACKEND_VARS.tmp" "$BACKEND_VARS"
      fi
    else
      note "Appending JWT_SIGNING_KEY to backend/.dev.vars (matched to frontend JWT_SECRET)…"
      echo "JWT_SIGNING_KEY=$CURRENT_JWT" >> "$BACKEND_VARS"
    fi
  fi
fi

# 4. Reset local D1 if requested.
if [ "$RESET" -eq 1 ] && [ -d .wrangler/state ]; then
  note "Wiping .wrangler/state/ (local D1)…"
  rm -rf .wrangler/state
fi

if [ "$USE_PROD" -eq 1 ]; then
  warn "⚠️  --prod: local dev server will read/write the PRODUCTION D1."
  warn "   Skipping local migrations + seed. Any write through the UI"
  warn "   (creating contacts, editing leads, deleting rows) mutates prod."
  warn "   Sanity-check before destructive actions."
else
  # 5. Apply migrations to local D1. Wrangler is idempotent — it tracks applied
  # migrations in a `d1_migrations` table, so this is safe to run every boot.
  note "Applying migrations to local D1 (ctv_crm)…"
  bunx wrangler d1 migrations apply ctv_crm --local </dev/null

  # 5b. Load the committed local-dev seed (sanitized snapshot of prod). All rows
  # use INSERT OR IGNORE so re-runs are no-ops and local edits are preserved;
  # use --reset to wipe state and reload from scratch. Every seeded user shares
  # password `localdev123`. Regenerate via `./scripts/seed-from-prod.sh`.
  SEED_FILE="seed/prod-snapshot.sql"
  if [ -f "$SEED_FILE" ]; then
    note "Loading local-dev seed ($SEED_FILE)…"
    bunx wrangler d1 execute ctv_crm --local --file="$SEED_FILE" -y >/dev/null
  else
    warn "No seed file at $SEED_FILE — local DB will start empty."
  fi
fi

if [ "$RUN_DEV" -eq 0 ]; then
  note "Bootstrap complete (--no-dev). Skipping dev server."
  exit 0
fi

# 6. Run dev server. @cloudflare/vite-plugin wires the D1 binding into
# `bun dev` (Vite + Cloudflare environment), so server fns can call getDB()
# during local development just like in prod. With --prod the vite plugin's
# `config` customizer (see vite.config.ts) reads USE_REMOTE_BINDINGS and
# flips every D1 binding to remote=true, proxying reads/writes to prod.
note "Starting Vite dev server → http://localhost:5173"
if [ "$USE_PROD" -eq 1 ]; then
  note "Bindings → PRODUCTION (ctv_crm on Cloudflare). Ctrl-C to stop."
  exec env USE_REMOTE_BINDINGS=1 bun dev
else
  note "Press Ctrl-C to stop. Local D1 lives in .wrangler/state/ (delete to reset)."
  exec bun dev
fi
