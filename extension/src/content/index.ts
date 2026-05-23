/**
 * Content-script entry — ambient activity capture.
 *
 * Injected on every comms surface in `manifest.json` content_scripts. At
 * runtime it resolves which surface this is, then runs the matching adapter
 * only while BOTH gates are open:
 *   - master switch (`agentEnabled`) — the rep's global consent
 *   - per-site allow-list (`siteAllowlist`) — "per-site allow-list, no surprises"
 *
 * It reacts live to `chrome.storage` changes, so toggling a site (or pausing
 * everything) from the popup starts/stops capture without a page reload.
 */

import { isSiteAllowed, siteForUrl, type SiteDef, type SiteId } from "../background/sites";
import { makeEmitter } from "./emit";
import type { Adapter } from "./types";
import { startGmail } from "./adapters/gmail";
import { startOutlook } from "./adapters/outlook";
import { startLinkedIn } from "./adapters/linkedin";
import { startTeams } from "./adapters/teams";

const ADAPTERS: Record<SiteId, Adapter> = {
  gmail: startGmail,
  outlook: startOutlook,
  linkedin: startLinkedIn,
  teams: startTeams,
};

function main(site: SiteDef): void {
  const emit = makeEmitter();
  let teardown: (() => void) | null = null;

  async function evaluate(): Promise<void> {
    const { agentEnabled } = await chrome.storage.local.get("agentEnabled");
    const masterOn = agentEnabled !== false; // default ON — mirrors toggle.ts
    const siteOn = await isSiteAllowed(site.id);
    const shouldRun = masterOn && siteOn;

    if (shouldRun && !teardown) {
      console.log(`[crema-capture] adapter active: ${site.id}`);
      teardown = ADAPTERS[site.id](emit);
    } else if (!shouldRun && teardown) {
      console.log(`[crema-capture] adapter stopped: ${site.id}`);
      teardown();
      teardown = null;
    }
  }

  void evaluate();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.agentEnabled || changes.siteAllowlist) void evaluate();
  });
}

const site = siteForUrl(location.href);
if (site) {
  main(site);
} else {
  console.log("[crema-capture] no adapter for", location.host);
}
