#!/usr/bin/env python3
"""Sanitize a wrangler d1 export into a committable local-dev seed.

Reads a raw `wrangler d1 export` dump and writes a seed file that:
  * drops schema (CREATE TABLE/INDEX) — migrations own that
  * drops d1_migrations + sqlite_sequence bookkeeping rows
  * rewrites every users row's password_hash/password_salt to the dev creds
    (password `localdev123`), so committing the seed never leaks real hashes
  * converts INSERT INTO → INSERT OR IGNORE INTO so re-running the seed
    is harmless and never overwrites local edits

Run via scripts/seed-from-prod.sh.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

DEV_PASSWORD = "localdev123"
DEV_HASH = "65b28420f1cc34f844e4447f2e9d2e7ead4cdf8dfefdc7b871241dbb35ef1229"
DEV_SALT = "00112233445566778899aabbccddeeff"

USERS_RE = re.compile(
    r'^(INSERT INTO "users" \([^)]*\) VALUES\()'
    r"('[^']*','[^']*'),'[^']*','[^']*',"
    r"(.*)$"
)

SKIP_TABLES = {"d1_migrations", "sqlite_sequence"}


def transform(line: str) -> str | None:
    s = line.rstrip("\n")
    if not s:
        return None
    if s.startswith("PRAGMA "):
        return None
    if s.startswith("CREATE TABLE") or s.startswith("CREATE INDEX"):
        return None
    # Drop the multi-line CREATE TABLE bodies (closing `);`).
    # Wrangler's dump only emits CREATE TABLE on its own line followed by
    # column lines and a closing `);` on its own line — we filter the whole
    # block in stream() below, not here.
    if s.startswith('INSERT INTO "'):
        table = s.split('"', 2)[1]
        if table in SKIP_TABLES:
            return None
        if table == "users":
            m = USERS_RE.match(s)
            if m:
                prefix, head, tail = m.group(1), m.group(2), m.group(3)
                s = f"{prefix}{head},'{DEV_HASH}','{DEV_SALT}',{tail}"
        s = s.replace("INSERT INTO", "INSERT OR IGNORE INTO", 1)
        return s
    return None


def stream(src: Path, dst: Path) -> None:
    in_create = False
    out_lines: list[str] = [
        "-- Local-dev seed generated from prod D1 via scripts/seed-from-prod.sh.",
        "-- All users share password `localdev123` (hash/salt below).",
        "-- Applied by run-local.sh after migrations; safe to re-run.",
        "PRAGMA defer_foreign_keys=TRUE;",
        "",
    ]
    for raw in src.read_text().splitlines():
        if in_create:
            if raw.rstrip().endswith(");"):
                in_create = False
            continue
        if raw.startswith("CREATE TABLE"):
            in_create = True
            continue
        transformed = transform(raw + "\n")
        if transformed is not None:
            out_lines.append(transformed)
    out_lines.append("")
    dst.write_text("\n".join(out_lines))


def main() -> None:
    if len(sys.argv) != 3:
        print(f"usage: {sys.argv[0]} <raw-dump.sql> <out.sql>", file=sys.stderr)
        sys.exit(2)
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    dst.parent.mkdir(parents=True, exist_ok=True)
    stream(src, dst)


if __name__ == "__main__":
    main()
