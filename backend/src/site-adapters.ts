// Site adapters — per-site selector maps so the copilot doesn't have to
// rediscover a page's DOM from scratch on every browser task.
//
// An adapter binds a stable set of *named elements* (search box, compose
// button, message field, send button…) to live CSS selectors for one site.
// The element NAMES are the contract the prompt and the outreach flows rely
// on; the SELECTORS are expected to rot — sites reship their DOM constantly.
//
// Two layers:
//   1. DEFAULT_ADAPTERS (this file)  — best-effort seed selectors, versioned
//      in git. `verified:false` means "nobody has confirmed this against the
//      live site yet — treat as a hint."
//   2. discovered overrides (D1 `site_adapter_overrides`) — what discovery
//      mode writes after reading the live DOM. `resolveSiteAdapter` in db.ts
//      merges the override on top of the default.
//
// Discovery mode: when a selector misses, the agent reads the live DOM, finds
// the real selector, and calls `saveSiteAdapter` — which upserts the override
// so the next run starts from the corrected map.

import { z } from "zod";

export const SiteElementSchema = z.object({
  selector: z.string().min(1),
  description: z.string(),
  verified: z.boolean(),
});
export type SiteElement = z.infer<typeof SiteElementSchema>;

export const SiteAdapterSchema = z.object({
  site: z.string().min(1),
  label: z.string(),
  hostPatterns: z.array(z.string()),
  homeUrl: z.string(),
  notes: z.string(),
  elements: z.record(z.string(), SiteElementSchema),
  source: z.enum(["default", "discovered"]),
  updatedAt: z.string().nullable(),
});
export type SiteAdapter = z.infer<typeof SiteAdapterSchema>;

function seed(selector: string, description: string): SiteElement {
  return { selector, description, verified: false };
}

// Best-effort seed maps. These WILL drift — they exist so a first run has
// something to try, and so discovery has named slots to fill. Anything that
// misses is a discovery-mode target, not a bug.
export const DEFAULT_ADAPTERS: Record<string, SiteAdapter> = {
  linkedin: {
    site: "linkedin",
    label: "LinkedIn",
    hostPatterns: ["linkedin.com", "www.linkedin.com"],
    homeUrl: "https://www.linkedin.com/feed/",
    notes:
      "Single-page app with obfuscated, frequently-changing class names — prefer aria-label and role selectors over class names. The rep is already signed in. Messaging lives at /messaging; a profile's Message and Connect buttons sit in the top card.",
    source: "default",
    updatedAt: null,
    elements: {
      global_search: seed(
        "input.search-global-typeahead__input",
        "Top-bar global search input for people, companies, and posts",
      ),
      message_box: seed(
        "div.msg-form__contenteditable",
        "Contenteditable body of the active message composer",
      ),
      message_send: seed(
        "button.msg-form__send-button",
        "Send button inside the message composer",
      ),
      connect_button: seed(
        'button[aria-label*="to connect"]',
        "Connect / Invite button on a profile card",
      ),
      profile_message_button: seed(
        'button[aria-label^="Message"]',
        "Message button on a profile card",
      ),
    },
  },
  gmail: {
    site: "gmail",
    label: "Gmail",
    hostPatterns: ["mail.google.com"],
    homeUrl: "https://mail.google.com/mail/u/0/",
    notes:
      "Gmail web. The rep is already signed in. Compose opens a floating dialog; the subject field name=subjectbox is the most stable anchor on the page.",
    source: "default",
    updatedAt: null,
    elements: {
      compose_button: seed(
        'div[role="button"][gh="cm"]',
        "Compose button that opens a new-message dialog",
      ),
      to_field: seed(
        'input[aria-label*="To recipients"]',
        "Recipient (To) input in the compose dialog",
      ),
      subject_field: seed(
        'input[name="subjectbox"]',
        "Subject line input in the compose dialog",
      ),
      body_field: seed(
        'div[aria-label="Message Body"][role="textbox"]',
        "Editable message body in the compose dialog",
      ),
      send_button: seed(
        'div[role="button"][data-tooltip*="Send"]',
        "Send button at the bottom of the compose dialog",
      ),
    },
  },
  office: {
    site: "office",
    label: "Outlook (Office.com)",
    hostPatterns: ["outlook.office.com", "outlook.office365.com", "office.com"],
    homeUrl: "https://outlook.office.com/mail/",
    notes:
      "Outlook on the web (Office.com mail). The rep is already signed in. Recipients use a people-picker; type the address then confirm the suggestion. Prefer aria-label selectors.",
    source: "default",
    updatedAt: null,
    elements: {
      new_mail_button: seed(
        'button[aria-label="New mail"]',
        "New mail button that opens the compose pane",
      ),
      to_field: seed(
        'div[aria-label="To"] input',
        "Recipient (To) people-picker input in the compose pane",
      ),
      subject_field: seed(
        'input[aria-label="Add a subject"]',
        "Subject line input in the compose pane",
      ),
      body_field: seed(
        'div[aria-label="Message body"][role="textbox"]',
        "Editable message body in the compose pane",
      ),
      send_button: seed(
        'button[aria-label="Send"]',
        "Send button in the compose pane toolbar",
      ),
    },
  },
};

/** Site keys with a default adapter, e.g. ["linkedin","gmail","office"]. */
export function listKnownSites(): string[] {
  return Object.keys(DEFAULT_ADAPTERS);
}

/**
 * Map a hostname (or full URL) to a known site key, or null if unsupported.
 * Matches the host suffix so `www.linkedin.com` and `linkedin.com` both hit.
 */
export function resolveSiteForHost(hostOrUrl: string): string | null {
  let host = hostOrUrl.trim().toLowerCase();
  try {
    if (host.includes("://")) host = new URL(host).hostname;
  } catch {
    // not a URL — treat the input as a bare host
  }
  host = host.replace(/:\d+$/, "");
  for (const adapter of Object.values(DEFAULT_ADAPTERS)) {
    for (const pattern of adapter.hostPatterns) {
      if (host === pattern || host.endsWith(`.${pattern}`)) return adapter.site;
    }
  }
  return null;
}

/**
 * Merge a discovered override onto a default adapter. Override elements
 * replace defaults by name; element names present only in the default are
 * kept so a partial discovery run never drops known slots.
 */
export function mergeAdapter(base: SiteAdapter, override: SiteAdapter | null): SiteAdapter {
  if (!override) return base;
  return {
    ...base,
    notes: override.notes || base.notes,
    homeUrl: override.homeUrl || base.homeUrl,
    elements: { ...base.elements, ...override.elements },
    source: "discovered",
    updatedAt: override.updatedAt,
  };
}
