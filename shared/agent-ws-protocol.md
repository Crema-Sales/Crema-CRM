---
type: contract
title: Agent WebSocket Protocol
tags: [protocol, websocket, cloudflare, durable-object, extension, agent]
created: 2026-05-18
---

# Agent WebSocket Protocol (v0.2)

Contract between the **rep's browser extension** (MV3 service worker) and the **Cloudflare Durable Object** (`RepAgent`, one instance per sales rep). Both implementations MUST conform to this document.

> **v0.2 (2026-05-20)** — additive: the extension now ambiently captures rep
> communication activity and pushes it upstream as unsolicited `activity_event`
> frames (see § "State events"). No change to the command surface. v0.1 peers
> ignore unknown frame types, so the rollout is non-breaking.

## Topology

```
Rep's Chrome + ext  --WSS(outbound)-->  CF Worker  --idFromName(repId)-->  RepAgent DO
                                                                              |
                                              POST /agents/:repId/act  <------+
                                              (from agent loop / cron / API)
```

- The extension dials outbound — no inbound port on the rep's machine.
- After upgrade, the channel is full-duplex. Either side may initiate.
- The DO uses the WebSocket **Hibernation API** (`state.acceptWebSocket`) so idle connections cost ~nothing.

## Endpoints

- `WSS /agents/:repId/ws` — extension upgrades here. JWT auth required.
- `POST /agents/:repId/act` — agent loop posts a command for the rep. Body: `{type, params}`. Response: `{ok, result}` (sync up to 30 s) or `{queued: true, id}` if rep offline.
- `GET /agents/:repId/status` — returns `{online: bool, enabled: bool, queueDepth: number}`.

## Authentication

- JWT in `?token=...` query param on WS upgrade and `Authorization: Bearer ...` on POSTs.
- JWT claims: `sub = repId`, `exp`, `iat`. Signed HS256 with `JWT_SECRET` (Cloudflare Worker secret).
- Worker validates BEFORE forwarding to the DO. DO trusts the Worker.

## Message Envelope

All frames are JSON. Top-level discriminator `type`.

### Commands (DO → extension)

```json
{ "id": "uuid-v4", "type": "navigate" | "click" | "type" | "snapshot" | "screenshot" | "eval", "params": { ... }, "ts": 1737000000000 }
```

### Responses (extension → DO)

```json
{ "id": "uuid-v4", "ok": true,  "result": { ... } }
{ "id": "uuid-v4", "ok": false, "error":  "string code" }
```

Error codes: `rep_disabled`, `tab_not_found`, `selector_not_found`, `timeout`, `eval_not_allowlisted`, `internal`.

### State events (extension → DO, unsolicited)

```json
{ "type": "online",  "enabled": true | false }
{ "type": "toggle",  "enabled": true | false }
```

### Activity events (extension → DO, unsolicited) — v0.2

The extension ambiently captures rep communication on Gmail,
Outlook-on-the-web, LinkedIn, and Teams-on-the-web, and pushes each as an
`activity_event` frame. The DO resolves `event.contact` against the org's
customer records and writes a CRM activity row — so reps never hand-log a
touchpoint. No response frame is expected (fire-and-forget, like `online`).

Capture uses two paths, transparent to the DO — the frame shape is identical:

1. **Network intent router (primary)** — a `chrome.webRequest` observer in the
   service worker matches the XHR a Send/Post click fires against a set of
   declarative `CaptureRule`s and reads the activity fields straight from the
   request body. Vendor API endpoints churn far slower than their DOM, so this
   is the durable signal.
2. **DOM adapters (fallback)** — the Phase B content-script adapters still run;
   they cover any event the network router misses and are the **only** path for
   Teams (its chat rides a WebSocket whose frames `webRequest` cannot read).

The service worker coalesces the two paths on event content, so a Send seen by
both still logs exactly one activity row. Capture rules are data, not code:
they ship bundled but a `captureRules` override in `chrome.storage.local` wins,
so a vendor breakage is a rule patch — no extension release.

```json
{
  "type": "activity_event",
  "ts": 1737000000000,
  "event": {
    "kind": "email_sent" | "email_received" | "linkedin_comment" | "linkedin_message" | "teams_message",
    "site": "gmail" | "outlook" | "linkedin" | "teams",
    "occurredAt": 1737000000000,
    "contact":   { "email": "string?", "name": "string?", "profileUrl": "string?" },
    "subject":   "string?",
    "preview":   "string?",
    "url":       "string?",
    "dedupeKey": "string"
  }
}
```

- `dedupeKey` — stable per logical event. The extension dedups within a
  service-worker lifetime; the DO MUST also dedup (a cold SW start can replay).
- `contact` — best-effort. For `email_received` the DO resolves the sender and
  **only logs the activity if it matches an existing customer** (no new records
  from inbound mail). `*_sent` / `*_message` / `*_comment` are rep-initiated and
  always log.
- Capture is gated client-side by the master switch **and** a per-site
  allow-list (`chrome.storage.local.siteAllowlist`); the DO receives events
  only for surfaces the rep left enabled.
- Free-text (`subject` ≤ 200 chars, `preview` ≤ 280 chars) is capped by the
  extension before send.

### Heartbeat

- Extension sends `{"type":"ping"}` every **25 s**.
- DO replies `{"type":"pong"}`. The DO MUST register a hibernation auto-response pair so pings don't wake the DO:
  ```ts
  state.setWebSocketAutoResponse(
    new WebSocketRequestResponsePair(
      JSON.stringify({ type: "ping" }),
      JSON.stringify({ type: "pong" })
    )
  );
  ```
- Extension: 3 missed pongs (75 s) → force close + reconnect.

### Reconnect

- Exponential backoff: 1 s, 2 s, 4 s, 8 s, 16 s, 32 s, **cap 60 s**.
- Jitter ± 20 %.
- On reconnect, DO drains its persisted command queue in FIFO order.

## Command Surface (initial)

| `type`       | `params`                                              | `result`                              | Notes                                                                 |
| ------------ | ----------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| `navigate`   | `{ tabId?: number, url: string }`                     | `{ tabId: number }`                   | Creates tab if `tabId` omitted. Waits for `load`.                     |
| `click`      | `{ tabId: number, selector: string, cdp?: bool }`     | `{}`                                  | `cdp:true` uses `Input.dispatchMouseEvent` (preferred for SPAs).      |
| `type`       | `{ tabId: number, selector: string, text: string }`   | `{}`                                  | Focuses element then dispatches keys.                                 |
| `snapshot`   | `{ tabId: number, max_bytes?: 1_000_000 }`            | `{ html: string }`                    | Returns `outerHTML`, capped.                                          |
| `screenshot` | `{ tabId: number, format?: "png"\|"jpeg" }`           | `{ data_url: string }`                | `chrome.tabs.captureVisibleTab`.                                      |
| `eval`       | `{ tabId: number, name: string, args?: object }`      | `{ value: unknown }`                  | `name` MUST be in the extension's allowlist. Never raw JS from server. |

## Rep-Side Master Switch

- The extension shows a toolbar action (`chrome.action`) edited from a popup (`default_popup`). The icon is green when ON / grey when OFF; a badge lights **REC** while ambient capture fires and **DRV** while a command executes — the "toolbar light" the marketing site promises.
- Persisted in `chrome.storage.local` under key `agentEnabled: boolean`.
- When OFF: extension responds to every command with `{ok:false, error:"rep_disabled"}` **and** suppresses ambient capture. Heartbeats continue (so the DO knows the rep is alive — just not granting control).
- Toggle changes emit a `{"type":"toggle", "enabled":...}` event upstream so the DO can adjust queueing strategy.
- A per-site allow-list (`chrome.storage.local.siteAllowlist`) further gates ambient capture per comms surface. It does **not** gate commands — agent-driven `navigate`/`click`/`type` run on any tab while the master switch is ON.

## Offline Queue

- DO persists pending commands in `state.storage` under key `queue: Command[]`.
- New commands posted while no WebSocket is accepted (`state.getWebSockets().length === 0`) are appended and return `{queued:true, id}`.
- On WS connect, drain FIFO, awaiting each result before sending the next. Failures DO NOT block the queue — log and continue.
- TTL: queue entries older than 24 h are dropped at drain time.

## Versioning

- Bump `v0.x` for additive changes. Both sides log a warning on version mismatch but continue.
- Breaking changes require coordinated rollout — bump major and pin in both `wrangler.toml` (`PROTOCOL_VERSION`) and `manifest.json` (`version_name`).
