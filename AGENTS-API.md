# AGENTS-API.md — HTTP API Contract

> The HTTP surfaces exposed by both Cloudflare Workers in this monorepo. Linked from [`AGENTS.md`](./AGENTS.md). Sibling docs: [`AGENTS-WORKERS.md`](./AGENTS-WORKERS.md) (agent-worker runtime + bindings), [`AGENTS-DEVOPS.md`](./AGENTS-DEVOPS.md) (CRM-worker deploy), [`AGENTS-AGENTS.md`](./AGENTS-AGENTS.md) (the DO that uses these routes as tools).

## Two-worker layout

We deploy **two** Workers, not one:

| Worker | Source | Path prefix | What it owns |
|---|---|---|---|
| `ctv-crm` (TanStack Start) | `frontend/` | UI routes, `/api/public/*`, `/api/v1/*`, `/login`, auth server-fns | The CRM D1 (`ctv_crm`), all CRM data, the rep's session cookie (`ctv_auth`), auth (PBKDF2 + JWT mint), outbound webhooks library |
| `ctrl-alt-elite-agent` (OpenAPIHono) | `backend/` | `/v1/*`, `/agents/:repId/*`, `/health`, `/docs`, `/openapi.json`, `/dev/token` | The `RepAgent` Durable Object, the `RepExtension` DO, the `RepMcp` DO, `CustomerStream` DO, daily-summary cron, OSINT/research tools, its own agent-side D1 (`crema-agent`) |

The agent worker calls **back into** the CRM worker over `/api/v1/*` carrying the rep's JWT as `Authorization: Bearer <jwt>` — same purview as the user. The CRM's `requireAuth` middleware accepts both the cookie (browser) and a bearer header (service-to-service) via `resolveAuthFromRequest` in `frontend/src/auth/middleware.ts`. The OpenAPI doc for the agent worker's surface is at `https://ctrl-alt-elite-agent.smashlabs.workers.dev/openapi.json`; rendered at `/docs`.

**Where auth actually happens.** Sign-up, sign-in, magic-link, password reset, and JWT issuance all live on the CRM worker (`frontend/src/auth/`). The agent worker only *verifies* JWTs it didn't mint, using the shared `JWT_SIGNING_KEY`. There is no `/v1/auth/*` route on the agent worker — anything resembling it earlier in this file is aspirational and should be considered the CRM worker's contract.

The `/v1/*` routes documented further down this file are the **agent worker's** introspection surface, served against its own D1 — they predate the cross-worker bridge and are still useful as the copilot's read surface. Cross-property ingest (`POST /v1/ingest`, `GET /v1/pixel`) lives on the agent worker; the CRM worker exposes its own `POST /api/public/ingest` (HMAC) + `POST /api/public/track` (guid) + `GET /api/public/pixel`.

## Principles

- **One API for two clients.** The React UI and the per-user `RepAgent` DO hit the same routes with the same JWT. There is no "agent-only" backdoor and no second authz path.
- **Zod schemas in `shared/` are the source of truth.** Frontend (typed fetch wrappers), backend (request validation), and agent tools all import from there. Drift is a P0 bug.
- **REST-ish, JSON in/out, idempotent by ID.** `PATCH` for partial updates, never `PUT`.
- **Authz is enforced in the route, once.** Tools, UI calls, and WebSocket messages converge here.
- **The public surface has a first-party CLI client.** [`cli/crema.ts`](./cli/README.md) — a zero-dep Bun/Node binary — mirrors every route under the CRM worker's `/api/v1/*` as a named subcommand, plus `crema raw <METHOD> <path>` for anything not wrapped. It is the canonical tool surface for *external* AI agents driving Crema on a user's behalf; internal agents (`RepAgent` DO) still call the routes directly with the rep's JWT. When you add or change a public `/api/v1/*` route, add or update the matching CLI command in the same PR.

## Auth

- `Authorization: Bearer <jwt>` for all `/v1/*` routes on the **agent worker** except `POST /v1/ingest` (HMAC), `GET /v1/pixel` (none), and `/health` / `/docs` / `/openapi.json` (public).
- JWT payload: `{ sub: <repId>, email?, exp, iat }`. HS256 signed with `JWT_SIGNING_KEY`. `repId` is either a UUIDv4 or a lowercased email (see `backend/src/rep-id.ts`).
- **Issuance lives on the CRM worker** (`frontend/src/auth/`). The agent worker only verifies. Both must share the same `JWT_SIGNING_KEY` Cloudflare secret.
- TTL is 8h. No refresh tokens; the user re-authenticates by signing in again. The CRM worker's cookie is named `ctv_auth`.
- WebSocket auth uses `?token=<jwt>` in the query string because the browser WebSocket API cannot set request headers.
- Dev-only escape hatch: when `ENVIRONMENT=dev`, `POST /dev/token` on the agent worker mints an 8h token for arbitrary `repId`; `?token=dev` is shorthand for the demo rep.
- **API keys (CLI / external agents)** — the CRM worker's `/api/v1/*` routes additionally accept long-lived bearer tokens of the form `crema_sk_…`, minted in the web app under Sidebar → CLI / API → CLI and stored hashed in the `api_keys` table. `resolveAuthFromRequest` (in `frontend/src/auth/middleware.ts`) first picks a token off the `Authorization: Bearer` header, falling back to the `ctv_auth` cookie; any token that starts with `crema_sk_` is then resolved against `api_keys` via `resolveApiKeyAuth`, while anything else is verified as a JWT. Both paths produce the same `AuthContext`. A key carries exactly the minting user's role + currently-selected org; revocation is instant via the web app. The CLI is the canonical consumer.

## Error shape

```json
{ "error": { "code": "not_found", "message": "customer not found", "details": null } }
```

Codes: `unauthorized`, `forbidden`, `not_found`, `validation_failed`, `conflict`, `rate_limited`, `internal`. HTTP status mirrors the code (`401`, `403`, `404`, `422`, `409`, `429`, `500`).

## Routes

> All routes below are on the **agent worker** (`ctrl-alt-elite-agent`) unless explicitly labeled otherwise. Auth routes live on the CRM worker — see `frontend/src/auth/server-fns.ts` (`signUp`, `signIn`, `signOut`, `getSession`) for the real implementation.

### Me / dashboard

| Method | Path                   | Purpose                                                                |
| ------ | ---------------------- | ---------------------------------------------------------------------- |
| `GET`  | `/v1/me`               | Current rep + assignments + WS connection hint                         |
| `GET`  | `/v1/me/dashboard`     | Trends, key activities, today's prioritized actions                    |
| `GET`  | `/v1/me/summary/today` | Most recent daily summary card (generated by the rep's copilot)        |

### Customers (CRUD)

| Method   | Path                                  | Purpose                                                |
| -------- | ------------------------------------- | ------------------------------------------------------ |
| `GET`    | `/v1/customers`                       | List rep's assigned customers (paginated, filterable)  |
| `POST`   | `/v1/customers`                       | Create (auto-assigns to caller unless `assigned_to`)   |
| `GET`    | `/v1/customers/:id`                   | Read one                                               |
| `PATCH`  | `/v1/customers/:id`                   | Partial update                                         |
| `DELETE` | `/v1/customers/:id`                   | Soft delete                                            |
| `GET`    | `/v1/customers/:id/timeline`          | Activity timeline (most recent first, paginated)       |
| `POST`   | `/v1/customers/:id/notes`             | Append a manual note (creates `activity` of type note) |
| `GET`    | `/v1/customers/:id/events` *(SSE)*    | Live updates for this customer — UI and DO both subscribe |

### Companies, leads, tickets

| Method | Path                        | Purpose                                              |
| ------ | --------------------------- | ---------------------------------------------------- |
| `GET`  | `/v1/companies/:id`         | Company profile + employees + deal pipeline          |
| `GET`  | `/v1/leads`                 | Pipeline view, filterable by stage                   |
| `PATCH`| `/v1/leads/:id`             | Move stage, update LTV estimate                      |
| `POST` | `/v1/leads/:id/drafts`      | Generate a follow-up draft (used by copilot)         |
| `GET`  | `/v1/tickets`               | Open + past tickets, with SLA flags                  |
| `PATCH`| `/v1/tickets/:id`           | Update status                                        |

### Prioritized action list

| Method | Path           | Purpose                                                                                  |
| ------ | -------------- | ---------------------------------------------------------------------------------------- |
| `GET`  | `/v1/actions`  | Ranked list for the calling rep: `(open_tickets * 3) + lead_score + days_since_contact`  |

### Prospect research (OSINT)

Agentic relationship-building stack: gather public, gift-actionable signals about a prospect so reps can build connections that close deals. See [`AGENTS-AGENTS.md`](./AGENTS-AGENTS.md#prospect-research-osint-tools) for the inner-loop architecture, safety rails, and tool catalog.

| Method  | Path                                              | Purpose                                                                                          |
| ------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `POST`  | `/v1/customers/:id/research`                      | Kick off an OSINT research run (async, ~30s). Returns 202 + `ResearchJob` with `status: pending`  |
| `GET`   | `/v1/customers/:id/research`                      | List prior research jobs for this customer (newest first, paginated)                              |
| `GET`   | `/v1/customers/:id/research/:job_id`              | Read one job. Once `status: complete`, includes the full `ProspectAffinities` payload             |
| `PATCH` | `/v1/customers/:id/research/:job_id`              | Terminal-state update — written by the `RepAgent` DO when its inner loop finishes                 |
| `POST`  | `/v1/customers/:id/gift-drafts`                   | Synthesize a single ship-ready gift idea + draft note from the latest complete research          |
| `GET`   | `/v1/customers/:id/gift-drafts`                   | List previously-drafted gift ideas for this customer                                              |

`ProspectAffinities` shape (excerpt — full schema in `shared/schemas/research.ts`):

```ts
{
  professional: { currentRole, recentPosts[], podcastsAppearedOn[], talksGiven[], almaMater[], socials[] },
  personal:     { sportsTeams[], hobbies[], favoriteMedia[], causes[], foodDrink, hometown },
  family:       { spouse?, kids: [{ name?, ageEstimate?, interests[] }], pets[] },
  giftIdeas:    [{ idea, rationale, priceBand: "$" | "$$" | "$$$", sourceUrls[] /* required */ }],
  confidence:   "high" | "medium" | "low",
  summary:      string,
  sources:      [{ url, snippet?, retrievedAt }]
}
```

Hard contract on output: every claim in the `personal` or `family` blocks must trace back to at least one URL in `sources`. The agent is instructed to omit anything it cannot cite — silent fabrication is worse than no signal. People-finder and address-aggregator domains are blocked at the `fetchUrl` layer.

### Ingest (cross-property activity)

| Method | Path                                       | Purpose                                                |
| ------ | ------------------------------------------ | ------------------------------------------------------ |
| `POST` | `/v1/ingest`                               | Accepts `track` / `identify` / `page` events; HMAC auth |
| `GET`  | `/v1/pixel?email=…&campaign=…`             | Email-open tracker (1×1 GIF response)                  |

Body shape:

```typescript
{
  type: "track" | "identify" | "page",
  event?: string,                      // required for "track"
  identity: { anonymous_id?: string, email?: string, user_id?: string },
  properties: Record<string, unknown>,
  timestamp: string,                   // ISO8601
  source: string                       // property name; matched to HMAC key
}
```

HMAC: `Authorization: HMAC <source>:<base64(hmac_sha256(body, INGEST_HMAC_KEYS[source]))>`. See [`AGENTS-WORKERS.md`](./AGENTS-WORKERS.md) for identity-resolution implementation.

### Webhook subscriptions (stretch)

| Method   | Path                                   | Purpose                              |
| -------- | -------------------------------------- | ------------------------------------ |
| `POST`   | `/v1/webhooks/subscriptions`           | Register `{ event_type, url }`       |
| `GET`    | `/v1/webhooks/subscriptions`           | List                                 |
| `DELETE` | `/v1/webhooks/subscriptions/:id`       | Remove                               |

### Agent WebSocket

| Protocol | Path                          | Purpose                                                                  |
| -------- | ----------------------------- | ------------------------------------------------------------------------ |
| `WS`     | `/v1/agent?token=<jwt>`       | Upgrade to the caller's `RepAgent` DO. Frame format per the `agents` SDK convention. |

See [`AGENTS-AGENTS.md`](./AGENTS-AGENTS.md) for the DO side.

## SSE topics

UI and the `RepAgent` DO both subscribe — this is the shared-view channel that keeps rep and copilot in sync without bespoke replication.

- `/v1/customers/:id/events` — per-customer activity stream
- `/v1/me/events` — assignment changes, new tickets, copilot proactive nudges

Server pushes a JSON message every time the corresponding `activity` row is inserted. Format: `{ type, customer_id?, activity_id, payload, ts }`.

## Pagination

`?cursor=<opaque>&limit=<n>` on list endpoints. Response: `{ items: [...], next_cursor: string | null }`. No offset pagination — D1 does not love it.

## Rate limiting

Out of scope for v1 (single demo, low QPS). If we add it: Cloudflare Rate Limiting Rules on the route pattern, not in-Worker.

## Versioning

Single `/v1` prefix forever. Breaking changes get a `/v2` route, both run, old one gets a `Deprecation` header. No silent breaks.
