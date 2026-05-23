/**
 * Network-layer intent router — the primary ambient-capture path.
 *
 * Runs in the service worker. `chrome.webRequest.onBeforeRequest` (observation
 * only — no `webRequestBlocking`, so no "being controlled" banner) watches XHR
 * to the comms surfaces. Each request is matched against the `CaptureRule`
 * set; a hit has its body parsed and the activity fields extracted straight
 * from the request payload.
 *
 * Why this beats DOM scraping: vendor CSS classes are rewritten every sprint,
 * but the request endpoints are versioned APIs and churn far slower. The
 * Phase B content-script adapters stay on as a fallback (and as the only path
 * for Teams, whose chat rides a WebSocket `webRequest` can't read) — the
 * service worker coalesces the two sources so an event logs at most once.
 *
 * Spec: shared/agent-ws-protocol.md § "Activity events".
 */

import { SITES, siteForUrl, getAllowlist, type Allowlist, type SiteId } from "./sites";
import { getCaptureRules, type CaptureRule, type FieldSpec } from "./capture-rules";
import { hash } from "../content/util";
import type { ActivityContact, ActivityEvent } from "../content/types";

/** Fire-and-forget sink — `index.ts` dedups, gates, and forwards to the DO. */
export type ForwardFn = (event: ActivityEvent, source: "dom" | "network") => void;

// ── gate cache ──────────────────────────────────────────────────────────────
// `onBeforeRequest` fires on every XHR to these origins (dozens/sec on Gmail).
// A storage read per request would be wasteful, so the master switch and
// allow-list are mirrored in memory and refreshed via `storage.onChanged`.
// `index.ts` still re-checks `getEnabled()` authoritatively before any send —
// this cache is only a cheap pre-filter.
let masterEnabled = true; // default ON — mirrors toggle.ts
let allowlist: Allowlist | null = null;

function siteAllowed(id: SiteId): boolean {
  // Before the cache populates, fail open — the authoritative async re-check
  // in `index.ts` still gates the actual send.
  return allowlist ? allowlist[id] : true;
}

async function refreshGateCache(): Promise<void> {
  try {
    const [{ agentEnabled }, list] = await Promise.all([
      chrome.storage.local.get("agentEnabled"),
      getAllowlist(),
    ]);
    masterEnabled = agentEnabled !== false;
    allowlist = list;
  } catch (err) {
    console.warn("[crema-capture] gate cache refresh failed:", err);
  }
}

// ── body parsing ────────────────────────────────────────────────────────────

/** A request body normalised to something `FieldSpec.path` can walk. */
type ParsedBody = Record<string, unknown>;

function decodeRaw(raw: chrome.webRequest.UploadData[] | undefined): string {
  if (!raw || raw.length === 0) return "";
  const decoder = new TextDecoder();
  let out = "";
  for (const part of raw) {
    if (part.bytes) out += decoder.decode(part.bytes, { stream: true });
  }
  return out + decoder.decode();
}

function parseBody(
  details: chrome.webRequest.WebRequestBodyDetails,
  encoding: CaptureRule["body"],
): ParsedBody | null {
  const rb = details.requestBody;
  if (!rb) return null;

  if (encoding === "form") {
    // Chrome pre-parses url-encoded / multipart bodies into `formData`.
    if (rb.formData) {
      const out: ParsedBody = {};
      for (const [k, v] of Object.entries(rb.formData)) out[k] = v;
      return out;
    }
    // Fallback: a raw url-encoded body Chrome didn't pre-parse.
    const text = decodeRaw(rb.raw);
    if (!text) return null;
    const out: ParsedBody = {};
    for (const [k, v] of new URLSearchParams(text)) {
      const prev = out[k];
      if (prev === undefined) out[k] = v;
      else if (Array.isArray(prev)) prev.push(v);
      else out[k] = [prev, v];
    }
    return out;
  }

  // JSON body — only ever arrives as `raw`.
  const text = decodeRaw(rb.raw);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as ParsedBody) : null;
  } catch {
    return null;
  }
}

// ── field extraction ────────────────────────────────────────────────────────

/** Walks a dotted path through nested objects/arrays. */
function getPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const key of path.split(".")) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(key);
      cur = Number.isInteger(idx) ? cur[idx] : undefined;
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return cur;
}

function extractField(body: ParsedBody, spec: FieldSpec): string | undefined {
  let value = getPath(body, spec.path);
  // Form values and some JSON fields surface as single-element arrays.
  if (Array.isArray(value)) value = value[0];
  if (value == null) return undefined;
  const str = typeof value === "string" ? value : String(value);
  if (!str) return undefined;
  if (spec.regex) {
    try {
      const m = str.match(new RegExp(spec.regex));
      return m ? (m[1] ?? m[0]) : undefined;
    } catch {
      return undefined;
    }
  }
  return str;
}

// ── rule matching ───────────────────────────────────────────────────────────

function matchesRule(rule: CaptureRule, details: chrome.webRequest.WebRequestBodyDetails): boolean {
  if (rule.match.method.toUpperCase() !== (details.method ?? "").toUpperCase()) return false;
  const url = details.url;
  if (rule.match.urlIncludes && !rule.match.urlIncludes.every((s) => url.includes(s))) {
    return false;
  }
  if (rule.match.urlRegex) {
    try {
      if (!new RegExp(rule.match.urlRegex).test(url)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function buildEvent(rule: CaptureRule, body: ParsedBody, url: string): ActivityEvent | null {
  const ex = rule.extract;
  const email = ex.contactEmail && extractField(body, ex.contactEmail)?.toLowerCase();
  const name = ex.contactName && extractField(body, ex.contactName);
  const profileUrl = ex.contactProfileUrl && extractField(body, ex.contactProfileUrl);
  const subject = ex.subject && extractField(body, ex.subject);
  const preview = ex.preview && extractField(body, ex.preview);

  // A rule that matched the request but extracted nothing useful is the
  // self-heal signal: the endpoint moved its fields. Degrade to no-emit (the
  // DOM adapter still covers the event) and surface it for the tuning pass.
  if (!email && !name && !profileUrl && !subject) {
    console.warn(
      `[crema-capture] rule '${rule.id}' matched ${url} but extraction was empty — needs tuning (TODO A1)`,
    );
    return null;
  }

  const contact: ActivityContact | undefined =
    email || name || profileUrl ? { email, name, profileUrl } : undefined;

  return {
    kind: rule.kind,
    site: rule.site,
    occurredAt: Date.now(),
    contact,
    subject,
    preview,
    url,
    // Network-source key. Cross-source coalescing with the DOM adapters is the
    // service worker's job (`index.ts`), keyed on content not on this string.
    dedupeKey: `${rule.site}:${rule.kind}:net:${hash(
      (email ?? name ?? profileUrl ?? "") + (subject ?? preview ?? ""),
    )}:${Math.floor(Date.now() / 2000)}`,
  };
}

// ── listener wiring ─────────────────────────────────────────────────────────

function handleRequest(forward: ForwardFn, details: chrome.webRequest.WebRequestBodyDetails): void {
  if (!masterEnabled) return;
  const site = siteForUrl(details.url);
  if (!site || !siteAllowed(site.id)) return;

  for (const rule of getCaptureRules()) {
    if (rule.site !== site.id || !matchesRule(rule, details)) continue;
    const body = parseBody(details, rule.body);
    if (!body) continue;
    const event = buildEvent(rule, body, details.url);
    if (event) {
      console.log(`[crema-capture] network hit: ${rule.id}`);
      forward(event, "network");
    }
    return; // first matching rule wins, hit or empty
  }
}

/**
 * Registers the `onBeforeRequest` observer. Call once at the top level of the
 * service-worker script — MV3 wants event listeners registered synchronously
 * so they survive (and re-attach on) SW restarts. The handler tolerates the
 * gate/rule caches not being warm yet: rules default to the bundled set and
 * the gates fail open, with `index.ts` re-checking authoritatively.
 */
export function initNetCapture(forward: ForwardFn): void {
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      try {
        handleRequest(forward, details);
      } catch (err) {
        console.warn("[crema-capture] net-capture handler threw:", err);
      }
    },
    { urls: SITES.flatMap((s) => s.matches), types: ["xmlhttprequest"] },
    ["requestBody"],
  );
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.agentEnabled || changes.siteAllowlist)) {
      void refreshGateCache();
    }
  });
  void refreshGateCache();
  console.log("[crema-capture] network intent router active");
}
