# AGENTS.md

Context for AI coding agents (Claude Code, Codex, Cursor, Maestro orchestrated agents, etc.) working in this repo. **Read this first.** Then load the architecture-docs sibling for whichever layer you're touching.

## What this repo is

**Crema Sales** — an open-source B2B CRM with a per-rep AI copilot and a Chrome extension that gives the copilot a browser to drive. The product runs entirely on the Cloudflare edge (Workers + D1 + KV + Durable Objects) so a single team can own every layer (auth, DB, secrets, observability) without third-party data stores. Live at [`cremasales.com`](https://cremasales.com).

The three shapes you'll touch:

1. **The CRM web app** (`frontend/`) — React + TanStack Start, served by the `ctv-crm` Cloudflare Worker, talking to D1 (`ctv_crm`) for all CRM data (contacts, companies, deals, activities, leads, tickets, relationships, tasks). This is the user-facing app and the source of truth for CRM data.
2. **The agent Worker** (`backend/`) — `ctrl-alt-elite-agent`, a Hono Worker that hosts the per-rep `RepAgent` Durable Object (the AI copilot), the `RepExtension` DO (WS broker for the Chrome extension), an MCP server (`RepMcp`), a `CustomerStream` DO for SSE topics, and its own D1 (`crema-agent`) for agent-side state (research, site adapters). Calls back into the CRM worker over HTTPS with the rep's JWT.
3. **The Chrome extension** (`extension/`) — MV3 service worker that dials the agent Worker over WSS, persists offline command queues, and executes browser commands (navigate / click / type / snapshot / screenshot / allowlisted eval) on the rep's tabs while a master toolbar switch is ON. Also runs ambient-capture adapters (Gmail / Outlook / LinkedIn / Teams) that emit activity events back to the agent.

All three speak through schemas in `shared/` — there is exactly one definition of every wire shape.

## Stack

- **Frontend (`frontend/`):** React + TanStack Start + TanStack Router, deployed to the `ctv-crm` Cloudflare Worker. D1 (`ctv_crm`) is the primary CRM store. Auth is email + password (PBKDF2-hashed, HS256 JWT cookie `ctv_auth`); domain auto-join via DNS-TXT verification; reusable invite links. Email via Resend.
- **Agent backend (`backend/`):** Cloudflare Workers (Hono) + D1 (`crema-agent`) + KV (`IDENTITY`) + Durable Objects (`RepAgent`, `RepMcp`, `RepExtension`, `CustomerStream`). LLM provider is OpenRouter (Claude via AI Gateway) by default, Workers AI as zero-secret fallback. Daily-summary cron at 13:00 UTC.
- **Extension (`extension/`):** Chrome MV3, Bun + esbuild, vanilla TS. Dials `wss://ctrl-alt-elite-agent.smashlabs.workers.dev` after a website handshake from `cremasales.com`. Released via the `Release Extension` GitHub Actions workflow on every push to `main` that touches `extension/**` or `shared/**`.
- **Shared (`shared/`):** Zod schemas + the agent WS protocol spec (`shared/agent-ws-protocol.md`). Imported by every other subtree.
- **Domain:** [`cremasales.com`](https://cremasales.com) — canonical hosted instance, on a Cloudflare custom domain attached to `ctv-crm`.

## Brand

**Name:** Crema. **Product:** Crema Sales.

*Crema* is the golden, caramel-colored foam layer on top of a properly pulled espresso shot — one of the most recognizable signals of a well-made coffee. The name does two jobs:

1. **Signals craft.** A CRM that cares about the finish, not just the function. The "crema on top" of your sales pipeline.
2. **Gives us a palette and a voice nobody else will pick.** AI-generated B2B SaaS defaults to blue/slate/indigo. We don't.

### Palette

- **Crema** (signature) — `#C9A36A` warm caramel-gold; primary CTAs and key accents.
- **Espresso** — `#3B2A1E` deep roasted brown; primary text, headers, dark surfaces.
- **Porcelain** — `#FAF6F0` off-white cup; page backgrounds.
- **Steam** — `#E8DFD2` muted warm gray; borders, secondary surfaces.
- **Shot** — `#7A4A2B` mid-roast accent; hover/active states, secondary CTAs.

No pure white, no pure black, no cool grays. Everything is warm. If a component reads "default shadcn," it's wrong.

### Voice

Warm, confident, a little playful. Coffee-shop-literate without being twee — we name things after espresso vocabulary where it reads naturally (a saved view could be a "Pull," a daily summary your "Morning Cup"), but we never force it. Function first; flavor second.

## Architecture docs (progressive disclosure)

Each layer has a canonical doc. **Read on demand based on what you're touching** — do not bypass these for hot takes or stale memory. The table below is the **index**: every architecture doc in this repo, what it covers, and when to load it.

| Doc | Covers | Load when… |
|---|---|---|
| [`AGENTS-API.md`](./AGENTS-API.md) | HTTP contract for both Workers — agent worker's `/v1/*` + `/agents/:repId/*`, CRM worker's `/api/v1/*` + `/api/public/*` | Adding a route, changing a payload, wiring a new tool the copilot can call |
| [`AGENTS-WORKERS.md`](./AGENTS-WORKERS.md) | Cloudflare Workers runtime for `backend/`: bindings, secrets, env vars, cron, deploy | Touching agent-worker bindings, secrets, D1 migrations, cron triggers, identity resolution, or `backend/wrangler.toml` |
| [`AGENTS-AGENTS.md`](./AGENTS-AGENTS.md) | Per-user `RepAgent` Durable Object copilot: tools, persona, scheduling, shared-view concurrency, OSINT/research inner loop | Anything the AI copilot does — tool catalog, persona prompt, scheduled work, memory, WS protocol |
| [`AGENTS-WEBHOOKS.md`](./AGENTS-WEBHOOKS.md) | Org-level outbound webhooks (lives on the CRM worker): subscriptions, signing, Slack | Adding/removing a CRM mutation, changing an event payload, touching `frontend/src/lib/webhooks/` or the Webhooks settings UI |
| [`AGENTS-DEVOPS.md`](./AGENTS-DEVOPS.md) | `frontend/` deploy: wrangler, D1, secrets, custom domain, schema migrations, prod inspection | Deploying frontend, rotating a CRM secret, applying a D1 migration to prod, debugging a `wrangler tail ctv-crm` failure |
| [`extension/README.md`](./extension/README.md) | Chrome MV3 extension: install, website handshake, master switch UX, command dedup, close codes, CDP/DOM modes | Touching anything under `extension/` |
| [`extension/TODO.md`](./extension/TODO.md) | Extension security backlog and demo-loosening tracker | Before publishing the extension or reviewing its CWS-readiness |

The copilot, the React UI, the extension broker, and the cross-property ingest endpoint all converge on the **same JWT**. The CRM worker mints it on login; both Workers verify it with the shared `JWT_SIGNING_KEY`. There is no second backdoor.

## Repo layout

```
.
├── frontend/         # TanStack Start CRM web app (the user-facing app)
│   ├── src/          # routes, server-fns, auth, components, hooks
│   ├── migrations/   # D1 SQL — append-only, lexicographic order
│   ├── public/       # static assets, including downloads/crema-agent-latest.zip
│   └── wrangler.jsonc
├── backend/          # ctrl-alt-elite-agent Worker (RepAgent DO, RepExtension DO, MCP)
│   ├── src/          # agent.ts, agent-tools.ts, rep-extension.ts, mcp.ts, routes/, …
│   ├── migrations/   # D1 (crema-agent) — append-only
│   └── wrangler.toml
├── extension/        # Chrome MV3 — ambient capture + agent control surface
│   ├── src/
│   │   ├── background/   # SW: ws-client, dispatch, toggle, validate, dedup, sites
│   │   ├── content/      # Per-site adapters (Gmail / Outlook / LinkedIn / Teams)
│   │   └── popup/        # Master switch + per-site allow-list UI
│   ├── scripts/build.ts
│   ├── manifest.json
│   └── README.md / TODO.md
├── shared/           # Zod schemas + WS protocol spec (imported by all subtrees)
├── tools/
│   └── data-generator/   # Deterministic D1 seeder for ctv_crm (--seed 42 reproducible)
├── docs/             # Long-form design docs (coach personas, /today PRD, etc.)
├── .github/workflows/
│   └── extension-release.yml   # Builds + releases extension zip on push to main
├── AGENTS.md         # This file (top-level index for AI agents)
├── AGENTS-API.md / AGENTS-WORKERS.md / AGENTS-AGENTS.md / AGENTS-WEBHOOKS.md / AGENTS-DEVOPS.md
├── README.md         # Human-facing intro and local dev / deployment
├── SECURITY.md       # Reporting + scope
└── LICENSE           # MIT
```

## Conventions

- **No env files in git.** `.env*`, `.dev.vars*`, `*.local`, `*.pem`, `*.key` are gitignored. Use `.dev.vars` for Wrangler locally and Cloudflare dashboard secrets for prod.
- **Shared types live in `shared/`.** Frontend, backend, and extension all import from there. Drift is a P0 bug.
- **All deploys go through Wrangler;** never edit production via the Cloudflare dashboard UI.
- **Database migrations are append-only** — add a new file under `frontend/migrations/` or `backend/migrations/`, never edit an applied migration.
- **The agent worker's `name` is still `ctrl-alt-elite-agent`** for historical reasons (the project was originally code-named ctrl-alt-elite). Don't rename casually — it's the production binding everything else points to.

## Deploy policy (branch vs main)

**Working directly on `main`** → every commit is intended for production. After you commit and push, **deploy the affected layer(s) to Cloudflare immediately** without prompting. Each subtree has its own deploy path:

```bash
# Frontend (CRM web app) — most edits land here
cd frontend
bun run deploy                                       # vite build && wrangler deploy
bunx wrangler d1 migrations apply ctv_crm --remote   # if a frontend migration was added

# Agent backend
cd backend
bun run deploy                                       # wrangler deploy
bunx wrangler d1 migrations apply crema-agent --remote   # if a backend migration was added

# Extension
# DO NOT deploy manually. The Release Extension GH Actions workflow runs on
# every push to main that touches extension/** or shared/**, builds the zip,
# and creates a GitHub Release. After the release is up, refresh the bundled
# copy that the CRM serves: drop the new zip into
# frontend/public/downloads/crema-agent-latest.zip and re-deploy frontend.
```

If a deploy fails, surface the error and stop — do not silently revert or skip.

**Working on any other branch** (`feature/*`, `fix/*`, agent worktrees, etc.) → local only. Run `bun run dev` (frontend / backend) or `bun run build` (extension) and verify locally. Do **not** deploy from a non-main branch; production tracks `main`. A branch becomes deployable the moment it lands in `main` via merge or fast-forward.

The rule is short on purpose: if the current branch is `main`, deploy the layer you touched. Otherwise, don't.

## Webhooks

Outbound webhooks at the org level: each org registers HTTP subscriptions in `/settings → Technical → Webhooks`, picks events to subscribe to, and chooses `json` or `slack` payload format. HMAC-signed, fire-and-forget via `ctx.waitUntil`, logged in `webhook_deliveries`. No retries, no DLQ — that's v2. Full architecture, event catalog, wire format, file map, and non-goals in [`AGENTS-WEBHOOKS.md`](./AGENTS-WEBHOOKS.md).

The `emitWebhookEvent()` helper in `frontend/src/lib/webhooks/emit.ts` is called from these mutations in `frontend/src/lib/crm.functions.ts`: `upsertContact` (insert branch — `contact.created`), `archiveContact` (`contact.archived`), `advanceStageManually` and the `maybeAdvanceStage` helper (`contact.stage_changed` — helper-level so the `toggleTask` auto-advance path is covered without double-firing), `createDeal` (`deal.created`), `updateDealStage` (`deal.won` / `deal.lost` / `deal.stage_changed`), `createTicket` (`ticket.created`), `updateTicket` (`ticket.status_changed` plus an intentional `ticket.resolved` double-fire on the resolve transition). The public ingest endpoint at `frontend/src/routes/api/public/ingest.ts` fires `purchase.created` in its purchase branch (no-ops until the path learns to resolve `org_id` from a tracking guid). All emits are post-write and org-scoped via `row.org_id`; a null `org_id` skips. `lead.created` has no live insert site today — only `seedDemo` writes to `leads`, and seed paths intentionally don't emit.

## Relationships entity (frontend)

`/relationships/$id` is the detail page for a top-level `relationships` record (introduced in migrations 0012–0016). Key facts:

- **`relationships.status`** — CHECK-constrained to `'new' | 'stale' | 'lead' | 'discovery' | 'budget_confirmed' | 'customer'`. Cups 1–3 map directly; cups 4–8 are derived in app code from the primary deal's kanban stage; cup 9 (close/lose) is the `customer` terminal state. Taxonomy is locked in `frontend/migrations/0013_relationship_status_check.sql`.
- **Junction tables** — `relationship_contacts`, `relationship_companies`, `relationship_deals` all have a `role TEXT NOT NULL DEFAULT 'primary'` column (`'primary'` or `'secondary'`). At most one primary per relationship is enforced by app code (not a DB constraint on the `role` column; use `is_primary` for the DB-level partial unique index if needed).
- **Notes** — `relationship_notes` (title, body, pinned, owner_id, org_id) is separate from the `activities` table.
- **Bootstrap** — `getOrCreateRelationshipForContact(contactId)` lazily creates a `relationships` row on first click of a contact card and auto-links the contact's existing company and most-recent deal.
- **Server functions** — all relationship mutations live at the bottom of `frontend/src/lib/crm.functions.ts`. The `CUP_STATUSES` export is the canonical status enum for UI code.

## Inline help drawer (frontend)

- **What:** A right-side `Sheet` drawer with per-route help content. Lives at `frontend/src/components/help/` (drawer, hotspot, storage) and `frontend/src/hooks/use-help.tsx` (provider, `?` shortcut, deep-link sync). Per-route content files are in `frontend/src/components/help/content/*.tsx`; each route registers via `useRegisterHelp(<content>)` and pages embed `<HelpHotspot anchor="…" label="…" />` chips next to confusing controls.
- **Open it:** topbar `?` button, the `?` keyboard shortcut (suppressed inside inputs / `cmdk`), or any inline `<HelpHotspot>`.
- **Deep-link format:** `?help=<topic-id>&anchor=<anchor-id>` on any route. Use `getDeepLink(pathname, topic, anchor?)` exported from `use-help.tsx` to build them (assistant chat, support replies, external docs). The drawer only opens if `topic` matches the route's currently-registered content — stale links silently no-op.
- **Authoring help:** copy an existing file under `frontend/src/components/help/content/`, follow its voice (terse, declarative, "Crema as narrator", no marketing-speak), then `useRegisterHelp(yourContent)` on the route. Add a `<HelpHotspot>` only if a control is genuinely confusing — every hotspot must earn its pixel.

## Extension (Chrome MV3)

Three things to know before touching `extension/`:

1. **Master switch is rep-owned.** The toolbar icon flips the agent ON/OFF. While OFF, the SW still maintains the WS to the agent worker (heartbeats fire so the DO knows the rep is online), but every dispatched command returns `{ok:false, error:"rep_disabled"}`. Don't add backdoors around this.
2. **Allowlist + JWT shape check are strict** (see `extension/src/background/validate.ts` and the top of `extension/src/background/index.ts`). The `agent_handoff` message from `cremasales.com` must come from an allowed origin, the JWT must be three base64url segments, and `baseUrl` must exact-match `wss://ctrl-alt-elite-agent.smashlabs.workers.dev` or end in `.cremasales.com`. These were tightened 2026-05-21 — don't loosen without a security review.
3. **The extension is released by GitHub Actions, not by anyone running wrangler.** The workflow is `.github/workflows/extension-release.yml`. It builds, zips, and creates a GitHub Release with both a versioned name and a stable `crema-agent-latest.zip` alias. The CRM web app serves a bundled copy at `/downloads/crema-agent-latest.zip` (refreshed manually — see [`AGENTS-DEVOPS.md`](./AGENTS-DEVOPS.md#extension-binary-refresh)).

Full extension reference: [`extension/README.md`](./extension/README.md). Outstanding security/UX work: [`extension/TODO.md`](./extension/TODO.md).
