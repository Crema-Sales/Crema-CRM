#!/usr/bin/env bash
# Re-export prod D1 and rebuild the committed local-dev seed.
#
#   ./scripts/seed-from-prod.sh
#
# Dumps the remote `ctv_crm` D1 via wrangler, sanitizes user credentials
# (every account is rewritten to password=`localdev123`), strips schema and
# migration bookkeeping, and writes the result to `seed/prod-snapshot.sql`.
#
# The committed seed is loaded by run-local.sh after migrations apply,
# so `bun dev` starts against real-shaped data without ever touching prod.

set -euo pipefail
cd "$(dirname "$0")/.."

RAW=/tmp/ctv-crm-prod.raw.sql
OUT=seed/prod-snapshot.sql

mkdir -p seed

echo "› Exporting prod D1 (ctv_crm) → $RAW"
bunx wrangler d1 export ctv_crm --remote --output="$RAW" -y >/dev/null

echo "› Sanitizing → $OUT"
python3 scripts/seed-from-prod.py "$RAW" "$OUT"

echo "› Done. Seed written to $OUT ($(wc -l <"$OUT") lines)."
echo "  All users now share password: localdev123"
