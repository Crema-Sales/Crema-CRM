import { AgentSocket, readAgentConfig } from "./ws-client";
import { applyVisualState, getEnabled, setEnabled, setActivity, getActivity } from "./toggle";
import { dispatch, type Command } from "./dispatch";
import { isValidRepId, isAllowedBaseUrl, normalizeBaseUrl } from "./validate";
import { rememberAck, recallAck } from "./dedup";
import { SITES, getAllowlist, setSiteAllowed, type SiteId } from "./sites";
import { initCaptureRules } from "./capture-rules";
import { initNetCapture } from "./net-capture";
import { hash } from "../content/util";
import type { ActivityEvent } from "../content/types";

console.log("[crema-agent] service worker boot");

const socket = new AgentSocket(readAgentConfig);

socket.onStatus(async (s) => {
  console.log("[crema-agent] status:", s);
  if (s === "open") {
    const enabled = await getEnabled();
    socket.send({ type: "online", enabled });
  }
});

socket.onMessage(async (msg) => {
  if (!msg || typeof msg !== "object") return;
  const m = msg as Partial<Command> & { type?: string };
  if (!m.id || !m.type || m.type === "pong") return;

  // Idempotency: if the DO replays a command id we already acked (after a
  // reconnect drain), re-send the cached response instead of re-executing.
  // Spec: TODO F7 in extension/TODO.md.
  const cached = recallAck(m.id);
  if (cached) {
    console.log(`[crema-agent] dedup hit for ${m.id} — replaying cached ack`);
    socket.send(cached);
    return;
  }

  const enabled = await getEnabled();
  let resp;
  if (!enabled) {
    resp = { id: m.id, ok: false, error: "rep_disabled" };
  } else {
    // Light the toolbar "driving" indicator for the duration of the command.
    await setActivity("driving");
    try {
      resp = await dispatch(m as Command);
    } finally {
      await setActivity("idle");
    }
  }
  rememberAck(m.id, resp);
  socket.send(resp);
});

// TODO(sec): re-tighten before CWS publish — paint ON optimistically so a
// freshly-installed extension doesn't flicker grey→green. Once the master
// switch defaults back to OFF, drop this and let the storage-read drive the
// initial paint.
void applyVisualState(true);
void (async () => {
  await applyVisualState(await getEnabled());
  await socket.connect();
})();

// Network-first ambient capture. The `chrome.webRequest` listener is
// registered synchronously (MV3 wants top-level registration so it re-attaches
// on SW restart); capture-rule loading is async and the handler tolerates the
// bundled defaults until any storage override resolves. The DOM adapters run
// independently in their content scripts and converge on `forwardActivityEvent`,
// which coalesces the two sources.
initNetCapture((event, source) => void forwardActivityEvent(event, source));
void initCaptureRules();

const KEEPALIVE_ALARM = "agent-keepalive";
chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM && !socket.isOpen()) {
    void socket.connect();
  }
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[crema-agent] onStartup");
  void socket.connect();
});

const DEFAULT_ONBOARD_URL = "https://cremasales.com/extension/onboard";

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("[crema-agent] onInstalled reason=", details.reason);
  void socket.connect();
  if (details.reason === "install") {
    const { onboardUrl } = await chrome.storage.local.get("onboardUrl");
    const base = typeof onboardUrl === "string" && onboardUrl ? onboardUrl : DEFAULT_ONBOARD_URL;
    const installId = crypto.randomUUID();
    const url = `${base}${base.includes("?") ? "&" : "?"}install_id=${encodeURIComponent(installId)}`;
    try {
      await chrome.tabs.create({ url });
    } catch (err) {
      console.warn("[crema-agent] failed to open onboarding tab:", err);
    }
  }
});

// Trusted-origin handoff: the marketing/app site posts the rep's credentials
// after login. Spec: README § "Website Handshake Contract".
//
// Defense-in-depth: `manifest.json` `externally_connectable.matches` already
// gates which origins can reach this listener, but we re-check `sender.origin`
// here so a future manifest loosening (or an `externally_connectable.ids`
// extension-keyed connection) can't silently widen the trust boundary.
const ALLOWED_HANDOFF_ORIGINS: readonly RegExp[] = [
  /^https:\/\/cremasales\.com$/,
  /^https:\/\/[a-z0-9-]+\.cremasales\.com$/,
  /^http:\/\/localhost(?::\d+)?$/,
];
// HS256 / JWT is three base64url segments. We can't verify the signature
// without the secret, but we can reject obvious garbage before storing it.
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  (async () => {
    const origin = sender.origin ?? "";
    if (!ALLOWED_HANDOFF_ORIGINS.some((re) => re.test(origin))) {
      console.warn("[crema-agent] handoff rejected: untrusted origin:", origin);
      sendResponse({ ok: false, error: "untrusted_origin" });
      return;
    }
    if (!message || typeof message !== "object") {
      sendResponse({ ok: false, error: "invalid_payload" });
      return;
    }
    const m = message as Record<string, unknown>;
    if (m.type !== "agent_handoff") {
      sendResponse({ ok: false, error: "unknown_type" });
      return;
    }
    const repId = typeof m.repId === "string" ? m.repId : "";
    const jwt = typeof m.jwt === "string" ? m.jwt : "";
    const baseUrl = typeof m.baseUrl === "string" ? m.baseUrl : "";
    if (!repId || !jwt || !baseUrl) {
      sendResponse({ ok: false, error: "missing_fields" });
      return;
    }
    if (!isValidRepId(repId)) {
      sendResponse({ ok: false, error: "malformed_repId" });
      return;
    }
    if (!JWT_SHAPE.test(jwt)) {
      sendResponse({ ok: false, error: "malformed_jwt" });
      return;
    }
    if (!isAllowedBaseUrl(baseUrl)) {
      console.warn("[crema-agent] handoff rejected: baseUrl not allowlisted:", baseUrl);
      sendResponse({ ok: false, error: "baseUrl_not_allowed" });
      return;
    }
    const normalized = normalizeBaseUrl(baseUrl) ?? baseUrl;
    await chrome.storage.local.set({
      agentRepId: repId,
      agentJwt: jwt,
      agentBaseUrl: normalized,
    });
    console.log("[crema-agent] agent_handoff persisted for rep", repId);
    void socket.connect();
    // Surface the master switch so the onboard page can render a distinct
    // "paired but switched off" state — credentials are linked, but the rep
    // still has to flip the coffee-cup ON for the agent to drive the browser.
    const enabled = await getEnabled();
    sendResponse({ ok: true, enabled });
  })();
  return true; // keep the channel open for async sendResponse
});

// ── Activity-event forwarding (network + DOM capture converge here) ─────────
// Two capture paths feed the CRM: the network intent router (net-capture.ts,
// primary) and the content-script DOM adapters (fallback, and the only path
// for Teams). Both can observe the same Send, so events are coalesced here.

// Exact dedup — content-script adapters fire observers liberally and re-run
// across SPA soft-navigations. Bounded FIFO of recently-seen dedupe keys;
// SW-lifetime only (a cold start may forward a duplicate — accepted).
const ACTIVITY_SEEN_CAP = 512;
const activitySeen = new Set<string>();
function activitySeenAdd(key: string): void {
  activitySeen.add(key);
  if (activitySeen.size > ACTIVITY_SEEN_CAP) {
    const oldest = activitySeen.values().next().value;
    if (oldest !== undefined) activitySeen.delete(oldest);
  }
}

// Cross-source coalescing — net-capture and the DOM adapter can each report
// the same outbound action with different per-source dedupeKeys. Collapse by
// (kind, counterparty, content) within a short window so the CRM logs the
// touchpoint once. Inbound `email_received` is exempt: its dedupeKey is a
// stable thread id, and two different inbound mails must both log.
const COALESCE_WINDOW_MS = 15_000;
const coalesceSeen = new Map<string, number>();

function coalesceKey(ev: ActivityEvent): string | null {
  if (ev.kind === "email_received") return null;
  const who = ev.contact?.email || ev.contact?.profileUrl || ev.contact?.name || "";
  return `${ev.kind}|${who}|${hash(`${ev.subject ?? ""}|${ev.preview ?? ""}`)}`;
}

function coalesceHit(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of coalesceSeen) {
    if (now - t > COALESCE_WINDOW_MS) coalesceSeen.delete(k);
  }
  const last = coalesceSeen.get(key);
  return last !== undefined && now - last < COALESCE_WINDOW_MS;
}

interface ForwardResult {
  ok: boolean;
  error?: string;
  deduped?: boolean;
  delivered?: boolean;
}

/**
 * Single funnel for ambient-capture events from both the network router and
 * the DOM adapters: dedup, coalesce, gate on the master switch, forward to the
 * RepAgent DO as a v0.2 `activity_event` frame. Spec:
 * shared/agent-ws-protocol.md § "Activity events".
 */
async function forwardActivityEvent(ev: unknown, source: "dom" | "network"): Promise<ForwardResult> {
  if (!ev || typeof ev !== "object") return { ok: false, error: "invalid_event" };
  const event = ev as ActivityEvent;

  const dk = typeof event.dedupeKey === "string" ? event.dedupeKey : null;
  if (dk && activitySeen.has(dk)) return { ok: true, deduped: true };
  const ck = coalesceKey(event);
  if (ck && coalesceHit(ck)) return { ok: true, deduped: true };

  // Authoritative master-switch gate — net-capture's in-memory cache is only a
  // cheap pre-filter. When OFF, drop without consuming dedup state.
  if (!(await getEnabled())) return { ok: false, error: "rep_disabled" };

  if (dk) activitySeenAdd(dk);
  if (ck) coalesceSeen.set(ck, Date.now());

  void setActivity("recording");
  const delivered = socket.send({ type: "activity_event", event, ts: Date.now() });
  console.log(`[crema-agent] activity_event (${source}): ${event.kind} delivered=${delivered}`);
  return { ok: true, delivered };
}

// Internal messages from the popup and the content-script adapters. Distinct
// from `onMessageExternal` — only the extension's own pages and scripts can
// reach this listener.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    const m = (message ?? {}) as Record<string, unknown>;
    switch (m.type) {
      case "activity_event": {
        // Ambient-capture event from a content-script DOM adapter.
        sendResponse(await forwardActivityEvent(m.event, "dom"));
        return;
      }
      case "popup_get_state": {
        const [enabled, allowlist, cfg] = await Promise.all([
          getEnabled(),
          getAllowlist(),
          readAgentConfig(),
        ]);
        sendResponse({
          ok: true,
          masterEnabled: enabled,
          connection: socket.status(),
          repId: cfg.repId || null,
          activity: getActivity(),
          sites: SITES.map((s) => ({ id: s.id, label: s.label, allowed: allowlist[s.id] })),
        });
        return;
      }
      case "popup_set_master": {
        await setEnabled(m.enabled === true, socket);
        sendResponse({ ok: true });
        return;
      }
      case "popup_set_site": {
        const id = m.siteId as SiteId;
        if (!SITES.some((s) => s.id === id)) {
          sendResponse({ ok: false, error: "unknown_site" });
          return;
        }
        await setSiteAllowed(id, m.enabled === true);
        sendResponse({ ok: true });
        return;
      }
      default:
        sendResponse({ ok: false, error: "unknown_type" });
    }
  })();
  return true; // async sendResponse
});

// expose for SW console debugging
(globalThis as unknown as { __cremaAgent?: { socket: AgentSocket } }).__cremaAgent = { socket };
