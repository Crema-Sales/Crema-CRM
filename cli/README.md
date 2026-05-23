# Crema CLI

A dependency-free command-line client for the **Crema Sales API**
(`https://cremasales.com/api/v1`).

Every public REST endpoint is exposed as a subcommand. Given an API key, the
CLI can tickle the entire API surface — which makes it equally useful as a
human tool and as a capability layer for **autonomous AI agents** that need to
read and write the CRM on a user's behalf.

- **Zero npm dependencies.** Just the standard library and the global `fetch`.
- **Runs on Bun or Node 18+.**
- **`--json` everywhere.** Stable machine-readable output for scripting and agents.
- **`raw` escape hatch.** Call any endpoint, even ones without a named command.

---

## Install

```sh
cd cli
bun install          # installs dev-only types; the CLI itself has no deps
```

Make `crema` available on your `PATH`:

```sh
bun link             # exposes the `crema` command globally
# …or run it in place:
./crema.ts <command>           # Bun (uses the shebang)
npx tsx crema.ts <command>     # Node 18+ fallback
```

## Authenticate

The CLI needs an **API key**. Mint one in the Crema web app:

> Sidebar → **CLI / API** → **CLI** tab → **Create key**

The key (`crema_sk_…`) is shown exactly once — copy it immediately. It carries
your role and current organization, so treat it like a password.

Provide the key in any of three ways (highest precedence first):

1. `--key crema_sk_…` flag on any command
2. `CREMA_API_KEY` environment variable
3. `~/.crema/config.json`, written by `crema configure`

```sh
crema configure      # interactive: prompts for the key + base URL
```

`configure` also stores the API base URL. It defaults to
`https://cremasales.com`; override with `--base` or `CREMA_API_BASE` to point
at a staging or local environment.

---

## Commands

| Command | Description |
| --- | --- |
| `crema configure` | Save an API key + base URL to `~/.crema/config.json` |
| `crema me` | Show the calling user's identity and organization |
| `crema actions` | List the prioritized action queue (tickets, leads, check-ins) |
| `crema contacts [--mine]` | List contacts; `--mine` forces owner = you |
| `crema contact <id>` | Show one contact with timeline + deal counts |
| `crema note <id> "<body>" [--subject "<text>"]` | Append a note to a contact |
| `crema deals` | List deals |
| `crema tickets` | List tickets with SLA flags |
| `crema smoke` | Call every endpoint and report reachability |
| `crema raw <METHOD> <path> [--data '<json>']` | Call any endpoint directly |
| `crema help` | Full usage |

### Global flags

| Flag | Meaning |
| --- | --- |
| `--key <crema_sk_…>` | API key (overrides env + config file) |
| `--base <url>` | API base URL (default `https://cremasales.com`) |
| `--json` | Emit raw JSON instead of a formatted view |

---

## Examples

```sh
crema me
crema contacts --mine
crema contact c_8f3a1b20
crema note c_8f3a1b20 "Left a voicemail, will retry Thursday" --subject "Follow-up"
crema deals --json
crema raw GET /api/v1/contacts/c_8f3a1b20 --json
crema smoke
```

Verify a key works end to end in one shot:

```sh
crema smoke
# Smoke test against https://cremasales.com — 5/5 passed
#   ✓ GET /api/v1/me               200
#   ✓ GET /api/v1/actions          200
#   ✓ GET /api/v1/contacts         200
#   ✓ GET /api/v1/deals            200
#   ✓ GET /api/v1/tickets          200
```

---

## Using the CLI from an AI agent

The CLI is built to be a clean tool surface for an autonomous agent driving
Crema. The contract:

- **Self-describing — no need to read the source.** `crema -h` prints a
  greppable catalog where every command starts with a `cmd:` line and every
  detail uses a fixed-width key, so an agent can spend nominal tokens to learn
  the surface:
  - `crema -h | grep '^  cmd:'` — enumerate every command
  - `crema <command> -h` — full detail for one command (usage, args, flags,
    HTTP method, return shape, example)
  - `crema help --json` — the entire catalog as structured JSON, ready to turn
    straight into tool definitions
- **Always pass `--json`.** Output becomes the raw API response — a stable,
  parseable shape — instead of the human-formatted view.
- **Exit codes are meaningful.** `0` on success, `1` on any HTTP or network
  error. On failure in `--json` mode, stdout is `{"error":"<message>"}`.
- **`raw` covers everything.** Any endpoint, any method, arbitrary JSON body
  via `--data`. New endpoints work without a CLI update.
- **Keys are scoped.** A key acts with exactly the minting user's role and
  organization — an agent can never exceed the purview of the person who
  created its key. Revoke the key in the web app to instantly cut access.

A minimal agent tool wrapper:

```sh
# read: the prioritized queue
crema actions --json

# act: log an outcome back to the CRM
crema note c_8f3a1b20 "Agent: emailed proposal v2" --json

# anything else
crema raw POST /api/v1/contacts/c_8f3a1b20/notes \
  --data '{"body":"Custom call","subject":"Discovery"}' --json
```

The full machine-readable API contract lives at
`https://cremasales.com/api/v1/openapi` (OpenAPI 3.1), rendered interactively
at `https://cremasales.com/api/v1/docs`.

---

## API surface

The CLI covers the complete public REST API:

| Method & path | Command |
| --- | --- |
| `GET /api/v1/me` | `me` |
| `GET /api/v1/actions` | `actions` |
| `GET /api/v1/contacts` | `contacts` |
| `GET /api/v1/contacts/{id}` | `contact <id>` |
| `POST /api/v1/contacts/{id}/notes` | `note <id> "<body>"` |
| `GET /api/v1/deals` | `deals` |
| `GET /api/v1/tickets` | `tickets` |

Every request is scoped to the calling user. Reps see only their own records;
admins and managers see the whole organization.
