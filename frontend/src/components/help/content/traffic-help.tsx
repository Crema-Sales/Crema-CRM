import { Link } from "@tanstack/react-router";

import type { HelpContent } from "@/hooks/use-help";
import {
  HelpKbd,
  HelpSection,
  HelpTip,
  useAnchorScroll,
} from "@/components/help/content/_layout";

export function TrafficHelpContent({
  activeAnchor,
}: {
  activeAnchor?: string;
}) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="traffic-overview" title="Overview">
        <p>
          Visitor Activity tracks the visitors that turn into leads — anonymous
          traffic from the Crema snippet that resolves to a known contact. The
          page polls every 5 seconds, so what you see is roughly real-time.
        </p>
        <p>The three counters at the top:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <span className="text-foreground font-medium">Unique visitors</span>{" "}
            — distinct anonymous IDs (cookie- or storage-based, one per
            browser).
          </li>
          <li>
            <span className="text-foreground font-medium">Became leads</span>{" "}
            — visitors that have been resolved to a contact.
          </li>
          <li>
            <span className="text-foreground font-medium">Conversion rate</span>{" "}
            — became leads as a share of unique visitors.
          </li>
        </ul>
        <p>
          The <span className="text-foreground font-medium">Leads</span> tab is
          the default view: one row per converted visitor. Raw event metrics —
          counts, top pages, the live stream — sit one click away under the{" "}
          <span className="text-foreground font-medium">Metrics</span> tab.
        </p>
      </HelpSection>

      <HelpSection id="traffic-time-windows" title="The Leads tab">
        <p>
          New traffic starts anonymous — Crema only has a generated
          identifier and whatever the browser sent. A visitor becomes a lead
          as soon as your snippet calls{" "}
          <code className="font-mono text-foreground">crema.identify()</code>{" "}
          with an email that matches a contact.
        </p>
        <p>
          The Leads tab is one row per converted visitor, newest conversion
          first. Each row reads:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <span className="text-foreground font-medium">Lead</span> — the
            contact the visitor resolved to; click through to their record.
          </li>
          <li>
            <span className="text-foreground font-medium">Stage</span> — the
            contact's relationship stage (lead, contact, deal, customer).
          </li>
          <li>
            <span className="text-foreground font-medium">First touch</span> /{" "}
            <span className="text-foreground font-medium">Became a lead</span> /{" "}
            <span className="text-foreground font-medium">Last seen</span> —
            when they first appeared, when they identified, and their most
            recent event.
          </li>
          <li>
            <span className="text-foreground font-medium">Journey</span> —{" "}
            <span className="text-foreground">N anon</span> events before
            identifying →{" "}
            <span className="text-foreground">N identified</span> events
            after.
          </li>
        </ul>
        <HelpTip>
          Crema doesn't retro-name the anonymous events that fired before a
          visitor identified — the Journey column counts them so you can see
          how much activity preceded the conversion.
        </HelpTip>
      </HelpSection>

      <HelpSection
        id="traffic-identification"
        title="How visitors get identified"
      >
        <p>
          The "Became leads" counter only ticks up when an anonymous visitor
          resolves to an email. There are four techniques the snippet supports
          today, ordered from "always on" to "opt-in":
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <span className="text-foreground font-medium">Cookie restore</span>{" "}
            — once a visitor has been identified in a browser, the snippet
            re-sends their identity on every subsequent event from that
            browser. Free, automatic, scoped to one device.
          </li>
          <li>
            <span className="text-foreground font-medium">
              Direct <code className="font-mono">crema.identify()</code>
            </span>{" "}
            — your own code calls{" "}
            <code className="font-mono text-foreground">
              crema.identify(email, traits)
            </code>{" "}
            when the visitor is known. The classic pattern is one line in your
            post-login handler so signed-in users identify on every visit.
          </li>
          <li>
            <span className="text-foreground font-medium">
              Signed campaign URL
            </span>{" "}
            — append{" "}
            <code className="font-mono text-foreground">?crema_eid=…</code> to
            outbound links (e.g. email blasts) and the snippet auto-identifies
            the recipient when they land. The token is HMAC-signed with your
            org's tracking secret, so attackers can't forge identities. Mint
            tokens from{" "}
            <Link to="/integrations" className="underline hover:text-foreground">
              Tracking &amp; Webhooks → "Sign a campaign link"
            </Link>
            , or sign on your side using the algorithm in the engineering
            doc.
          </li>
          <li>
            <span className="text-foreground font-medium">
              Form-blur capture
            </span>{" "}
            — call{" "}
            <code className="font-mono text-foreground">
              window.crema.autoCapture()
            </code>{" "}
            once on page load and the snippet identifies on the blur event of
            any email input. Off by default — pair with your cookie-consent
            banner.
          </li>
        </ul>
        <HelpTip>
          What we don't do today: reverse-IP / company reveal and
          "visitor-to-email" identity-graph services. Both are opt-in
          integration tiers, not default behavior — ask Pedram if your
          deployment needs them.
        </HelpTip>
      </HelpSection>

      <HelpSection id="traffic-segments" title="The Metrics tab">
        <p>
          <span className="text-foreground font-medium">Events by type</span>{" "}
          counts every distinct{" "}
          <code className="font-mono text-foreground">event_name</code>{" "}
          your snippet has sent (pageviews, custom events, anything you
          tracked).
        </p>
        <p>
          <span className="text-foreground font-medium">Top pages</span>{" "}
          ranks the most-hit paths. Path only — no host, no query string.
        </p>
        <p>
          The{" "}
          <span className="text-foreground font-medium">Live event stream</span>{" "}
          table is the last 200 events, newest first. Columns: when, event
          name, who (named or anon), path, referrer.
        </p>
        <p>
          There are no time-window controls or segment filters today.
        </p>
        <p className="text-xs">
          Tip: hit <HelpKbd>?</HelpKbd> on any page to reopen this drawer.
        </p>
      </HelpSection>

      <HelpSection id="traffic-related" title="Related">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Link to="/activity" className="underline hover:text-foreground">
              Activity
            </Link>{" "}
            — once a visitor is identified, signal rows roll up into their
            contact feed.
          </li>
          <li>
            <Link to="/relationships" className="underline hover:text-foreground">
              Relationships
            </Link>{" "}
            — the people on the other end of the events.
          </li>
        </ul>
      </HelpSection>
    </div>
  );
}

export const trafficHelpContent: HelpContent = {
  id: "traffic",
  title: "Visitor Activity",
  eyebrow: "crema / help",
  anchors: [
    { id: "traffic-overview", label: "Overview" },
    { id: "traffic-time-windows", label: "Leads tab" },
    { id: "traffic-identification", label: "How visitors get identified" },
    { id: "traffic-segments", label: "Metrics tab" },
  ],
  component: TrafficHelpContent,
};
