/**
 * Capture rules — the data layer of the network-first intent router.
 *
 * The Phase B content-script adapters target vendor CSS classes that Google /
 * Microsoft / LinkedIn rewrite every sprint. The durable signal lives one
 * layer down: the XHR a "Send" / "Post" click fires. Those endpoints are
 * versioned APIs backing mobile + partner integrations, so they churn far
 * slower than the DOM — and the recipient / subject / body are *in the request
 * body*, no scraping required.
 *
 * A `CaptureRule` is the declarative description of one such request:
 *   - how to recognise it (method + URL match)
 *   - how to pull the activity fields out of its body
 *
 * Rules are DATA, not code. They ship bundled (`DEFAULT_RULES`) but a
 * `captureRules` override in `chrome.storage.local` wins — so a vendor breakage
 * is a server-pushed rule patch, not an extension release. `net-capture.ts`
 * consumes the cache this module maintains.
 *
 * Spec: shared/agent-ws-protocol.md § "Activity events".
 */

import type { SiteId } from "./sites";
import type { ActivityKind } from "../content/types";

/**
 * Locates one field inside a parsed request body.
 *  - `path` — dotted path. For JSON bodies, walks objects/arrays
 *    (`a.b.0.c`). For form bodies, the top-level form key.
 *  - `regex` — optional. Applied to the located string; capture group 1 (or
 *    the whole match) is used. Lets a rule pull an email out of a noisier
 *    field without a code change.
 */
export interface FieldSpec {
  path: string;
  regex?: string;
}

export interface CaptureRule {
  /** stable id — also the handle a future server-side patch upserts against. */
  id: string;
  site: SiteId;
  kind: ActivityKind;
  /** how the request body is encoded — picks the parser in net-capture. */
  body: "json" | "form";
  match: {
    /** HTTP method, upper-case. */
    method: string;
    /** every substring must appear in the URL — cheap pre-filter. */
    urlIncludes?: string[];
    /** optional regex the URL must match — narrows past `urlIncludes`. */
    urlRegex?: string;
  };
  extract: {
    contactEmail?: FieldSpec;
    contactName?: FieldSpec;
    contactProfileUrl?: FieldSpec;
    subject?: FieldSpec;
    preview?: FieldSpec;
  };
}

/**
 * Bundled seed rules.
 *
 * ⚠️ TUNE — the `match`/`extract` values below are best-effort and reasoned
 * from each vendor's known API shape, but NOT validated against live signed-in
 * traffic. A rule that matches the request but extracts nothing logs a
 * "rule matched but extraction empty" warning (the self-heal signal) and the
 * DOM adapter still covers the event. Tighten these by driving a real session
 * with the `interceptor` CLI and inspecting the request bodies — see TODO A1.
 *
 * Teams is intentionally absent: Teams web carries chat over a WebSocket, and
 * `chrome.webRequest` cannot read WS frame bodies. Teams stays DOM-only.
 */
export const DEFAULT_RULES: readonly CaptureRule[] = [
  {
    id: "gmail.email_sent",
    site: "gmail",
    kind: "email_sent",
    body: "form",
    // Gmail's compose-send RPC: /mail/u/<n>/...&act=sm  (send message).
    match: { method: "POST", urlIncludes: ["mail.google.com", "act=sm"] },
    extract: {
      contactEmail: { path: "to", regex: "[\\w.+-]+@[\\w-]+\\.[\\w.-]+" },
      subject: { path: "subject" },
      preview: { path: "body" },
    },
  },
  {
    id: "outlook.email_sent",
    site: "outlook",
    kind: "email_sent",
    body: "json",
    // OWA send: the Substrate/OWA mail API exposes a SendMessage-style action.
    match: { method: "POST", urlIncludes: ["/ows/", "Send"] },
    extract: {
      contactEmail: {
        path: "Body.Message.ToRecipients.0.EmailAddress.Address",
      },
      contactName: { path: "Body.Message.ToRecipients.0.EmailAddress.Name" },
      subject: { path: "Body.Message.Subject" },
    },
  },
  {
    id: "linkedin.linkedin_message",
    site: "linkedin",
    kind: "linkedin_message",
    body: "json",
    // Voyager messaging send.
    match: {
      method: "POST",
      urlIncludes: ["linkedin.com/voyager/api", "messaging"],
    },
    extract: {
      preview: { path: "message.body.text" },
      contactProfileUrl: { path: "hostRecipientUrns.0" },
    },
  },
  {
    id: "linkedin.linkedin_comment",
    site: "linkedin",
    kind: "linkedin_comment",
    body: "json",
    // Voyager comment creation under the social/feed surface.
    match: {
      method: "POST",
      urlIncludes: ["linkedin.com/voyager/api", "socialActions"],
      urlRegex: "comments",
    },
    extract: {
      preview: { path: "comment.values.0.value.text" },
    },
  },
];

const RULES_KEY = "captureRules";

/**
 * In-memory cache so `net-capture`'s `onBeforeRequest` handler — which fires
 * on every XHR to a comms surface — never blocks on a storage read.
 */
let cachedRules: readonly CaptureRule[] = DEFAULT_RULES;

/** Synchronous read of the current rule set. Populated by `initCaptureRules`. */
export function getCaptureRules(): readonly CaptureRule[] {
  return cachedRules;
}

function applyStored(stored: unknown): void {
  if (Array.isArray(stored) && stored.length > 0) {
    // A stored override fully replaces the bundled set — a server patch ships
    // the complete rule list so removals propagate too.
    cachedRules = stored as CaptureRule[];
  } else {
    cachedRules = DEFAULT_RULES;
  }
}

/**
 * Loads any `captureRules` override and subscribes to live updates, so a
 * server-pushed patch (written to `chrome.storage.local`) hot-reloads the
 * fleet with no extension release. Call once at service-worker boot.
 */
export async function initCaptureRules(): Promise<void> {
  try {
    const out = await chrome.storage.local.get(RULES_KEY);
    applyStored(out[RULES_KEY]);
  } catch (err) {
    console.warn("[crema-capture] failed to load capture rules:", err);
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[RULES_KEY]) return;
    applyStored(changes[RULES_KEY].newValue);
    console.log(`[crema-capture] capture rules hot-reloaded (${cachedRules.length} rules)`);
  });
}
