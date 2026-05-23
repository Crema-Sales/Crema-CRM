# data-generator

Deterministic demo-data minter for the `ctv_crm` D1 database. No LLM calls
at runtime — combines hand-curated word banks (100 company names, 100 first
names, 100 last names, 100 domain stems, plus industries / titles /
sources / note fragments) with a seedable PRNG so that runs are
reproducible (`--seed 42`) but feel varied.

## Setup

```bash
cd tools/data-generator
bun install
```

Wrangler is already installed in `../../frontend`. The generator
shells out to `wrangler d1 execute ctv_crm --local|--remote --file ...`
from that directory, so anything that works in `bun dev` for the frontend
works here.

## Commands

```bash
./datagen orgs list
./datagen orgs create --name "Acme Inc"

./datagen companies --count 50 --org org_cremasales
./datagen companies create --org org_cremasales --name "Acme Inc" \
                           --domain acme.com --industry SaaS

./datagen contacts --count 100 --org org_cremasales
./datagen contacts create --org org_cremasales --name "Jane Doe" \
                          --email jane@acme.com --company-id <id>

./datagen leads --count 25 --org org_cremasales
./datagen leads create --org org_cremasales --contact-id <id> \
                       --source "Inbound — pricing page" --score 80

./datagen all --count 25 --org org_cremasales  # 25 companies + 25 contacts + 25 leads
```

## Global options

| Flag         | Default | Meaning |
|--------------|---------|---------|
| `--target`   | `local` | `local` or `remote` D1 |
| `--seed`     | random  | Seed the PRNG for reproducible output |
| `--dry-run`  | `false` | Print SQL, don't execute |

## When the API is ready

The `runSql` shim in `src/lib/d1.ts` is the only thing that touches the
database. Swap it for an HTTP client once the org/CRM endpoints are wired
and the rest of the generator stays put.
