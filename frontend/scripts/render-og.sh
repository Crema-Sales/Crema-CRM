#!/usr/bin/env bash
# Regenerate the social link-preview image and favicons from their HTML sources.
#
# Requires the `interceptor` CLI (drives a real Chrome session) and macOS `sips`.
# Run from the frontend/ directory:  ./scripts/render-og.sh
set -euo pipefail

cd "$(dirname "$0")/.."
here="$(pwd)"

render() {  # render <html> <selector> <long-edge> -> echoes the saved PNG path
  interceptor open "file://${here}/scripts/$1" >/dev/null
  sleep 1.5  # let web fonts settle
  interceptor screenshot --save --format png --selector "$2" \
    --target-max-long-edge "$3" 2>/dev/null | grep -o '"filePath": *"[^"]*"' | cut -d'"' -f4
}

og="$(render og-card.html '#og' 2576)"
sips -z 630 1200 "$og" --out public/og-image.png >/dev/null
rm -f "$og"
echo "public/og-image.png  (1200x630)"

icon="$(render og-icon.html '#icon' 1024)"
sips -z 180 180 "$icon" --out public/apple-touch-icon.png >/dev/null
sips -z 48 48 "$icon" --out public/favicon-48.png >/dev/null
rm -f "$icon"
echo "public/apple-touch-icon.png  (180x180)"
echo "public/favicon-48.png  (48x48)"
echo "public/favicon.svg is hand-authored vector — edit directly."
