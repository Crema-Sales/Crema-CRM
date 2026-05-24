# AGENTS-AGENTS.md — Per-User Durable Object Copilot

> The agentic backend layer. Linked from [`AGENTS.md`](./AGENTS.md). Sibling docs: [`AGENTS-WORKERS.md`](./AGENTS-WORKERS.md) (runtime + bindings), [`AGENTS-API.md`](./AGENTS-API.md) (HTTP contract the copilot shares with the UI).

## Purpose

Every logged-in sales rep gets a dedicated AI copilot that lives on the Cloudflare edge, is instantiated on login, and acts as a second pair of hands inside the CRM. The copilot and the rep share the same view, the same data, and the same API. They can work the same record concurrently — the rep edits a customer while the copilot drafts a follow-up, and both writes appear live in both UIs.

## Runtime: Durable Objects, one per `sales_rep_id`

- **Binding:** `AGENT` (declared in `wrangler.toml`).
- **DO class:** `RepAgent` in `backend/src/agent.ts`.
- **Naming:** `env.AGENT.idFromName(sales_rep_id)` — exactly one instance per rep, globally addressable, no allocation logic needed.
- **Lifecycle:**
  - **Spawn:** UI opens a WebSocket to `/v1/agent?token=<jwt>` immediately after the auth callback. The Worker upgrades the socket and forwards it to the DO via `env.AGENT.get(id).fetch(req)`. The DO materializes; if it has prior storage, it hydrates from there.
  - **Run:** Each turn streams through `AIChatAgent.onChatMessage`. Tools execute as `fetch()` back into the same Worker API.
  - **Hibernate:** After ~30s idle, the DO hibernates; storage persists. Next message wakes it in <100ms.
  - **Cron wake:** Daily summary fan-out fires `env.AGENT.get(id).fetch('/cron/daily')` for each active rep — see "Scheduled tasks" below.
  - **HTTP wake (synchronous coach):** `POST /v1/coach/chat` on the agent worker forwards to `env.AGENT.get(id).fetch('/chat/once')`, which runs `RepAgent.chatOnce()` — same persona + tool catalog as the WS path, but a single-shot `generateText` call that returns the final text + tool transcript as JSON. The route does NOT append to `this.messages`, so a CLI invocation can't interleave with a live UI WebSocket on the same DO. Exposed publicly through the CRM worker's `POST /api/v1/coach/chat`, which mints a 120s rep JWT from the caller's API key + persona overlays and proxies down.

## Framework: Cloudflare `agents` SDK

`npm i agents` — Cloudflare-maintained, MIT, purpose-built for DOs.

- `AIChatAgent` base — manages message history in DO storage, streaming, the tool-calling loop, WebSocket plumbing, summarization rollups.
- `useAgent` / `useAgentChat` React hooks — frontend connects in ~10 lines.
- `this.schedule(cronExpr | dateOrSeconds, callbackName, payload)` — per-rep reminders ("ping me about lead 47 tomorrow") survive hibernation and restart.
- Provider-agnostic — OpenRouter via Cloudflare AI Gateway (primary, Claude models), Workers AI fallback behind `AGENT_LLM_PROVIDER=workers-ai`.

Docs: https://developers.cloudflare.com/agents/

## Tool routing: the copilot uses the same API as the UI

Every tool is a thin wrapper around an existing route in [`AGENTS-API.md`](./AGENTS-API.md), called server-to-server with the rep's JWT (passed in at agent construction, refreshed on each WS reconnect).

```typescript
// backend/src/agent-tools.ts
export const tools = (env: Env, jwt: string) => ({
  // ── CRM surface
  listMyCustomers:    () => api(env, jwt, 'GET',   '/v1/customers'),
  getCustomer:        (id: string) => api(env, jwt, 'GET', `/v1/customers/${id}`),
  getTimeline:        (id: string) => api(env, jwt, 'GET', `/v1/customers/${id}/timeline`),
  updateCustomer:     (id: string, patch: CustomerPatch) => api(env, jwt, 'PATCH', `/v1/customers/${id}`, patch),
  addNote:            (id: string, body: string) => api(env, jwt, 'POST', `/v1/customers/${id}/notes`, { body }),
  listOpenTickets:    () => api(env, jwt, 'GET',   '/v1/tickets?status=open'),
  prioritizedActions: () => api(env, jwt, 'GET',   '/v1/actions'),
  draftFollowUp:      (leadId: string) => api(env, jwt, 'POST', `/v1/leads/${leadId}/drafts`, {}),
  // ── Prospect research (OSINT)
  researchProspect:   (customerId: string, hint?: string)         => api(env, jwt, 'POST', `/v1/customers/${customerId}/research`, { hint }),
  getResearch:        (customerId: string, jobId: string)         => api(env, jwt, 'GET',  `/v1/customers/${customerId}/research/${jobId}`),
  listResearch:       (customerId: string)                        => api(env, jwt, 'GET',  `/v1/customers/${customerId}/research`),
  draftGift:          (customerId: string, opts?: GiftDraftReq)   => api(env, jwt, 'POST', `/v1/customers/${customerId}/gift-drafts`, opts ?? {}),
  listGiftDrafts:     (customerId: string)                        => api(env, jwt, 'GET',  `/v1/customers/${customerId}/gift-drafts`),
  // ── Scheduler
  scheduleReminder:   (when: string, what: string) => this.schedule(when, 'reminder', { what }),
});
```

### Prospect research (OSINT) tools

`researchProspect` kicks off an async background job inside the same `RepAgent` DO. The DO runs an inner agentic loop with its own toolset — `webSearch`, `fetchUrl`, `findSocialProfiles`, `saveAffinities` — to gather *gift-actionable signals* about a prospect: sports teams, hobbies, recent posts/talks, podcasts they've been on, and (with strict source-citation rules) family interests. The point isn't a CRM enrichment dump — it's "what would make this person feel seen if you sent them a thoughtful object." See `backend/src/osint-tools.ts` for the inner toolset and `agent-prompts.ts:RESEARCH_SYSTEM_PROMPT` for the persona.

Job lifecycle:

1. `researchProspect(customerId)` returns a `ResearchJob` with `status: 'pending'`.
2. The DO's `/research/run` handler runs the inner loop (target: 30s, capped at 8 steps).
3. The LLM ends the loop by calling `saveAffinities` with a fully-structured `ProspectAffinities` object.
4. The DO PATCHes `/v1/customers/:id/research/:job_id` with the result. The PATCH appends an `agent_action` activity row so the rep's timeline shows the run.
5. `draftGift(customerId)` synthesizes a single, citable, ship-ready gift idea + draft note from the latest completed job.

Safety rails (enforced in `osint-tools.ts` and the prompt):

- Every claim in the personal / family blocks must cite at least one source URL. The LLM is instructed to fail closed (omit the claim) when sourcing is weak.
- People-finder / address-aggregator domains are hard-blocked at the `fetchUrl` layer (`BLOCKED_HOSTS`). Hometown from a public LinkedIn bio is fine; home address from a paywalled people-finder is not.
- All outbound HTTP is time-boxed (15s) and content-capped (200KB) to keep the loop honest.
- Search backend: Tavily when `TAVILY_API_KEY` is set, DuckDuckGo HTML scrape otherwise (demo-only fallback).

**Why route through the API and not D1 directly:**

- Authz is enforced once, in the API layer. Tools cannot accidentally leak another rep's data.
- The copilot's writes go through the same validation, the same activity logging, the same outbound webhook fan-out as the UI's writes. One code path, not two.
- Audit log (`activities` table) attributes the action to the rep with `source: "agent"` vs `source: "ui"`.

## Shared-view concurrency: rep and copilot work together

The copilot and the rep are two clients of the same API. Both must see each other's writes live. No bespoke replication.

- **Server → both clients:** every mutating route inserts an `activity` row and publishes to a per-customer SSE topic (`/v1/customers/:id/events`). UI and DO both subscribe.
- **Optimistic UI:** the frontend applies its own changes immediately and reconciles when the SSE echo arrives.
- **Copilot → UI:** when a tool call writes data, the DO does not push to the UI itself — the API's SSE topic does it.
- **UI → copilot:** when the rep edits a record, the DO receives the SSE event in its state handler and can either inform the current generation ("the rep just updated X") or factor it into the next turn.

```mermaid
flowchart LR
    ui["CRM UI<br/>(rep)"]
    agent["RepAgent DO<br/>(copilot)"]
    api["Worker API<br/>/v1/*"]
    d1[(D1)]

    ui  -->|HTTP+JWT|  api
    agent -->|fetch+JWT| api
    api --> d1
    api -.->|SSE: /v1/customers/:id/events| ui
    api -.->|SSE: /v1/customers/:id/events| agent
    ui  <-->|WebSocket| agent
```

This is what "literally working together" means in our stack: shared API + shared SSE channel + per-record event topic.

## Conversation memory

- **Short-term:** message history in DO storage, capped at ~50 turns with summarization rollups (built into `AIChatAgent`).
- **Long-term:** none in v1. A v2 candidate is summarizing old turns into a `rep_agent_memory` D1 table keyed by `sales_rep_id`.

## Scheduled tasks

- **Daily summary** — Cron fires at 13:00 UTC (configurable in `wrangler.toml`). Worker enumerates `sales_reps WHERE active = 1`, calls each DO's `/cron/daily`. The DO pulls `prioritizedActions`, `listOpenTickets`, and yesterday's timeline, generates a markdown summary, stores it under `daily_summary:YYYY-MM-DD` in DO storage. UI renders the latest via `GET /v1/me/summary/today` as the top card on the dashboard.
- **Per-rep reminders** — `this.schedule(...)` invoked from a tool call. Fires back into the DO, which sends a proactive chat message ("you wanted me to ping you about lead 47 — here is where it stands").

## LLM provider

- **Primary:** OpenRouter via Cloudflare AI Gateway, defaulting to a Claude model (Haiku for tool-calling turns, Sonnet for the daily summary). The Gateway gives us caching, retries, and a single billing surface; the OpenRouter passthrough lets us switch between Anthropic / Meta / OpenAI without secret rotation. Config in `backend/wrangler.toml` (`AGENT_LLM_PROVIDER`, `AI_GATEWAY_ID`, `AI_GATEWAY_ACCOUNT_ID`); implementation in `backend/src/llm.ts`.
- **Fallback:** Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast` behind `AGENT_LLM_PROVIDER=workers-ai`. Enables a wifi-out demo path with zero egress and zero external-service risk.
- **Secrets:** `OPENROUTER_API_KEY` and `AI_GATEWAY_ACCOUNT_ID` via `wrangler secret put`. Never in repo, never in `.dev.vars` checked in (the example file ships with empty values).

## File layout

```
backend/src/
  agent.ts             # RepAgent extends AIChatAgent — onChatMessage, onScheduled, cron handlers, /research/run
  agent-tools.ts       # Chat tool definitions (one fn per API route the copilot can hit)
  agent-prompts.ts     # System prompts: copilot persona, daily-summary template, RESEARCH_SYSTEM_PROMPT
  osint-tools.ts       # Inner-loop toolset for the research run: webSearch, fetchUrl, findSocialProfiles, saveAffinities
  routes/research.ts   # POST/GET /v1/customers/:id/research, PATCH callback, /gift-drafts
  index.ts             # Worker entry; routes /v1/agent WS upgrade to the AGENT DO
```

## What the copilot cannot do (v1)

- No outbound email or Slack from inside the copilot. If it wants to send a message, it returns a draft for the rep to confirm. Outbound webhook fan-out is server-side via `ctx.waitUntil` on the CRM worker — see [`AGENTS-WEBHOOKS.md`](./AGENTS-WEBHOOKS.md). There is no Cloudflare Queue in this stack.
- No cross-rep visibility. A `RepAgent` instance only ever sees its own rep's data — enforced by the JWT it carries, not by the DO itself.
- No tool that mutates schema, deletes customers, or changes assignments. Reads and activity-style writes only.
- No prospect research against private data sources. The OSINT loop is restricted to public web pages and refuses people-finder / address-aggregator domains. Home addresses, phone numbers, social-security data, and minor-children PII pulled from data brokers are all out of scope. The hard rule for the research surface: *every personal or family claim cites a public URL the rep can open and verify.*

## The shared-view beat

Open two browsers as the same rep. In one, edit a customer's phone number. In the other, the copilot chat is open — the copilot's next message references the new phone number without prompting. That is what "the copilot shares the rep's view" actually means in code: same API, same SSE topic, same writes — no bespoke replication path.
