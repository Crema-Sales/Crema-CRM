#!/usr/bin/env bash
# Add the Resend DNS records for cremasales.com via the Cloudflare API.
# Idempotent: existing records with the same name+type+value are left alone;
# missing ones are POSTed. Requires:
#   CLOUDFLARE_API_TOKEN  — a token scoped to Zone:DNS:Edit on cremasales.com.
# Optional:
#   CLOUDFLARE_ZONE_ID    — skip the zone-id lookup if you already know it.
#
# Usage:
#   CLOUDFLARE_API_TOKEN=xxx ./scripts/phase05-cloudflare-dns.sh
#
# DELETE this script once the records are live and verified at Resend — it
# only does one-time setup work.

set -euo pipefail

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "ERROR: set CLOUDFLARE_API_TOKEN (Zone:DNS:Edit on cremasales.com)" >&2
  exit 2
fi

CF_API="https://api.cloudflare.com/client/v4"
AUTH=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json")

note() { printf "\033[1;36m›\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m!\033[0m %s\n" "$*" >&2; }
fail() { printf "\033[1;31m✗\033[0m %s\n" "$*" >&2; exit 1; }

# 1. Resolve the zone id for cremasales.com.
if [ -z "${CLOUDFLARE_ZONE_ID:-}" ]; then
  note "Looking up zone id for cremasales.com…"
  ZONE_JSON=$(curl -fsS "${AUTH[@]}" "$CF_API/zones?name=cremasales.com")
  ZONE_ID=$(echo "$ZONE_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); rs=d.get('result',[]); print(rs[0]['id'] if rs else '')")
  [ -n "$ZONE_ID" ] || fail "cremasales.com not found in this Cloudflare account."
  note "Zone id: $ZONE_ID"
else
  ZONE_ID="$CLOUDFLARE_ZONE_ID"
fi

# 2. Upsert one record. Skips if (type, name, content) already matches.
upsert_record() {
  local TYPE="$1" NAME="$2" CONTENT="$3" PRIORITY="${4:-}"
  local FULL_NAME="${NAME}.cremasales.com"
  if [ "$NAME" = "@" ]; then FULL_NAME="cremasales.com"; fi

  note "Checking $TYPE $FULL_NAME…"
  local EXISTING
  EXISTING=$(curl -fsS "${AUTH[@]}" \
    "$CF_API/zones/$ZONE_ID/dns_records?type=$TYPE&name=$FULL_NAME")
  local MATCHED
  MATCHED=$(echo "$EXISTING" | python3 -c "
import json, sys
d=json.load(sys.stdin)
target=sys.argv[1].strip()
rs=d.get('result',[])
for r in rs:
    if r.get('content','').strip()==target:
        print(r['id']); break
" "$CONTENT")
  if [ -n "$MATCHED" ]; then
    note "  already exists ($MATCHED) — skipping"
    return 0
  fi

  local PAYLOAD
  if [ -n "$PRIORITY" ]; then
    PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'type':sys.argv[1],'name':sys.argv[2],'content':sys.argv[3],'priority':int(sys.argv[4]),'ttl':1,'proxied':False}))" "$TYPE" "$FULL_NAME" "$CONTENT" "$PRIORITY")
  else
    PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'type':sys.argv[1],'name':sys.argv[2],'content':sys.argv[3],'ttl':1,'proxied':False}))" "$TYPE" "$FULL_NAME" "$CONTENT")
  fi
  note "  creating…"
  curl -fsS -X POST "${AUTH[@]}" -d "$PAYLOAD" \
    "$CF_API/zones/$ZONE_ID/dns_records" \
    | python3 -c "import json,sys; r=json.load(sys.stdin); print('  ✓ created' if r.get('success') else '  ✗ '+str(r.get('errors')))"
}

# 3. The three records Resend gave us for cremasales.com.
upsert_record "TXT" "resend._domainkey" "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDQmAvEyYx/DnvJmHjuDeijq5cPcT4I9pe/v1F3SPLhf0jwx3M6ckqr4GNswK/9q+BSuj+lqUPES3RxRMoI4+PrbCSOTiInINJe12haEBH62M5/vw0Ax1faKk4Fr9t7c2lPca3m9xK7YB/xKyfS5uyuTORzNzr7xM0yrxQmBvDQLQIDAQAB"
upsert_record "MX"  "send"             "feedback-smtp.us-east-1.amazonses.com" "10"
upsert_record "TXT" "send"             "v=spf1 include:amazonses.com ~all"

# 4. Optional DMARC (start in monitor mode).
note "DMARC (monitor-only) — recommended but optional:"
upsert_record "TXT" "_dmarc" "v=DMARC1; p=none; rua=mailto:dmarc@cremasales.com; aspf=r; adkim=r;"

note "All records reconciled. Resend usually verifies within 5-30 min."
note "Status check:"
echo "  curl -s -H \"Authorization: Bearer \$RESEND_API_KEY\" \\"
echo "    https://api.resend.com/domains/154d80dd-59e1-4f26-b71b-741737a6d3c4 | python3 -m json.tool"
