/**
 * Comms-surface registry + per-site allow-list.
 *
 * The marketing site promises a "per-site allow-list, no surprises" — the rep
 * controls which communication tools the extension is allowed to ambiently
 * observe. This module is the single source of truth for that list, shared by:
 *   - the popup (renders + edits the allow-list)
 *   - the content-script adapters (Phase B — gate observation on isSiteAllowed)
 *   - manifest.json `content_scripts[].matches` (kept in sync by hand)
 *
 * The allow-list governs *ambient capture only*. Agent-driven commands
 * (navigate/click/type) are gated by the master switch and may run on any tab
 * — see README § permission justifications.
 */

export type SiteId = "gmail" | "outlook" | "linkedin" | "teams";

export interface SiteDef {
  id: SiteId;
  label: string;
  /** chrome `content_scripts[].matches` patterns — mirror into manifest.json. */
  matches: string[];
  /** hostname suffixes for runtime URL → site resolution. */
  hostSuffixes: string[];
}

export const SITES: readonly SiteDef[] = [
  {
    id: "gmail",
    label: "Gmail",
    matches: ["https://mail.google.com/*"],
    hostSuffixes: ["mail.google.com"],
  },
  {
    id: "outlook",
    label: "Outlook",
    matches: [
      "https://outlook.office.com/*",
      "https://outlook.office365.com/*",
      "https://outlook.live.com/*",
    ],
    hostSuffixes: ["outlook.office.com", "outlook.office365.com", "outlook.live.com"],
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    matches: ["https://www.linkedin.com/*"],
    hostSuffixes: ["linkedin.com"],
  },
  {
    id: "teams",
    label: "Microsoft Teams",
    matches: ["https://teams.microsoft.com/*"],
    hostSuffixes: ["teams.microsoft.com"],
  },
];

const ALLOWLIST_KEY = "siteAllowlist";

export type Allowlist = Record<SiteId, boolean>;

/**
 * Reads the allow-list, defaulting every known site to ON (opt-out model —
 * the product's promise is to capture comms automatically; the rep opts a
 * surface *out* if they want to).
 */
export async function getAllowlist(): Promise<Allowlist> {
  const out = await chrome.storage.local.get(ALLOWLIST_KEY);
  const stored = (out[ALLOWLIST_KEY] ?? {}) as Partial<Record<string, unknown>>;
  const full = {} as Allowlist;
  for (const s of SITES) full[s.id] = stored[s.id] !== false;
  return full;
}

export async function setSiteAllowed(id: SiteId, enabled: boolean): Promise<void> {
  const current = await getAllowlist();
  current[id] = enabled;
  await chrome.storage.local.set({ [ALLOWLIST_KEY]: current });
}

export async function isSiteAllowed(id: SiteId): Promise<boolean> {
  return (await getAllowlist())[id];
}

/** Resolve a tab URL to its comms-surface definition, if any. */
export function siteForUrl(url: string): SiteDef | undefined {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return undefined;
  }
  return SITES.find((s) => s.hostSuffixes.some((h) => host === h || host.endsWith(`.${h}`)));
}
