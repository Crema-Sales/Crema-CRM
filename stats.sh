#!/usr/bin/env bash
# stats.sh — deterministic line-of-code count for the ctrl-alt-elite repo.
#
# Counts only code we wrote ourselves. Excludes:
#   - node_modules and other pulled-down JS libraries
#   - build artifacts (dist, build, .wrangler, .tanstack, .next, ...)
#   - lockfiles (bun.lock, package-lock.json, yarn.lock, pnpm-lock.yaml)
#   - generated type defs (worker-configuration.d.ts)
#   - minified bundles (*.min.js / *.min.css)
#
# shadcn/ui components are reported separately: they are copied verbatim
# from a component library, not authored here.
#
# Output is deterministic — the same working tree always yields the same
# numbers, regardless of when or where the script runs.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

ALL="$(mktemp)"
trap 'rm -f "$ALL"' EXIT

# 1. Collect every file, pruning dependency / build / tooling directories,
#    then strip lockfiles, generated defs, and minified bundles.
find . \
  \( -name node_modules -o -name .git -o -name dist -o -name build \
     -o -name .next -o -name .turbo -o -name coverage -o -name .wrangler \
     -o -name .tanstack -o -name .lovable -o -name .maestro \
     -o -name .github -o -name .vscode -o -name .idea \) -prune -o \
  -type f -print \
  | LC_ALL=C sort \
  | grep -Ev '(^|/)(bun\.lock|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$' \
  | grep -Ev 'worker-configuration\.d\.ts$' \
  | grep -Ev '\.min\.(js|css)$' \
  > "$ALL"

# sumloc: read file paths on stdin, print "<loc> <files>".
sumloc() {
  local list files loc
  list="$(cat)"
  files="$(printf '%s\n' "$list" | grep -c . || true)"
  if [ "${files:-0}" -eq 0 ]; then
    echo "0 0"
    return
  fi
  loc="$(printf '%s\n' "$list" | grep -E '.' | tr '\n' '\0' \
        | xargs -0 wc -l 2>/dev/null \
        | grep -v ' total$' | awk '{s+=$1} END{print s+0}')"
  echo "${loc:-0} ${files}"
}

# emit: print one aligned row for the file list on stdin; add it to TLOC/TFILES.
TLOC=0
TFILES=0
emit() {
  local label="$1" res loc files
  res="$(sumloc)"
  loc="${res%% *}"
  files="${res##* }"
  TLOC=$((TLOC + loc))
  TFILES=$((TFILES + files))
  if [ "$files" -gt 0 ]; then
    printf '  %-26s %9d LOC  %5d files\n' "$label" "$loc" "$files"
  fi
}

# code: code files matching a regex, excluding shadcn/ui.
code() { grep -E "$1" "$ALL" | grep -Ev '/components/ui/' || true; }

CODE_EXT='\.(ts|tsx|js|jsx|mjs|py|sql|sh|css|html)$'

echo "=== ctrl-alt-elite — lines of code we wrote ==="
echo "git HEAD: $(git rev-parse --short HEAD 2>/dev/null || echo n/a)"
echo
echo "Our code by language"
echo "(excludes node_modules, build output, lockfiles, shadcn/ui):"
emit "TypeScript (.ts)" < <(code '\.ts$')
emit "React TSX (.tsx)"  < <(code '\.tsx$')
emit "JavaScript"        < <(code '\.(js|jsx|mjs)$')
emit "Python"            < <(code '\.py$')
emit "SQL (migrations)"  < <(code '\.sql$')
emit "Shell"             < <(code '\.sh$')
emit "CSS"               < <(code '\.css$')
emit "HTML"              < <(code '\.html$')
echo "  --------------------------------------------------------"
printf '  %-26s %9d LOC  %5d files\n' "TOTAL — OUR CODE" "$TLOC" "$TFILES"

echo
echo "Reported separately (not authored here):"
grep -E '\.(ts|tsx|js|jsx)$' "$ALL" | grep -E '/components/ui/' | emit "shadcn/ui components"

echo
echo "Not counted as code (informational):"
grep -E '\.md$'            "$ALL" | emit "Markdown docs"
grep -E '\.(json|jsonc)$'  "$ALL" | emit "JSON config"
grep -E '\.(toml|ya?ml)$'  "$ALL" | emit "TOML/YAML config"

echo
echo "Our code by top-level directory:"
DIRS="$(code "$CODE_EXT" \
  | sed -E 's#^\./([^/]+)/.*#\1#; s#^\./[^/]+$#(root)#' \
  | LC_ALL=C sort -u)"
while IFS= read -r d; do
  [ -z "$d" ] && continue
  if [ "$d" = "(root)" ]; then
    code "$CODE_EXT" | grep -E '^\./[^/]+$' | emit "(root)"
  else
    code "$CODE_EXT" | grep -E "^\./${d}/" | emit "$d"
  fi
done <<< "$DIRS"
