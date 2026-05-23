import { Link } from "@tanstack/react-router";

import type { HelpContent } from "@/hooks/use-help";
import { HelpKbd, HelpSection, HelpTip, useAnchorScroll } from "@/components/help/content/_layout";

export function IntegrationsHelpContent({ activeAnchor }: { activeAnchor?: string }) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="integrations-overview" title="Overview">
        <p>
          Everything that connects Crema to the outside world: the{" "}
          <span className="text-foreground font-medium">tracking snippet</span> for your web
          properties, <span className="text-foreground font-medium">webhooks</span> that fan Crema
          events out to other systems, and the{" "}
          <span className="text-foreground font-medium">activity ingestion webhook</span> that
          pushes server-side events in.
        </p>
      </HelpSection>

      <HelpSection id="integrations-tracking" title="Tracking snippet">
        <p>
          The tracking snippet auto-fires pageviews. Call{" "}
          <code className="font-mono text-foreground">crema.track(name, props)</code> for custom
          events and <code className="font-mono text-foreground">crema.identify(email, props)</code>{" "}
          to attach an anonymous visitor to a contact. For outbound email blasts, use the{" "}
          <span className="text-foreground font-medium">Sign a campaign link</span> helper — it
          produces a URL with <code className="font-mono text-foreground">?crema_eid=…</code> that
          auto-identifies the recipient on landing. See the{" "}
          <Link to="/traffic" className="underline hover:text-foreground">
            Visitor Activity
          </Link>{" "}
          help drawer for the full catalog of identification techniques.
        </p>
        <p>
          The <span className="text-foreground font-medium">tracking secret</span> is the HMAC key
          for signed campaign links — treat it like a server credential. Anyone with it can forge
          identity for visitors to your tracked sites.
        </p>
      </HelpSection>

      <HelpSection id="integrations-ingest" title="Activity ingestion">
        <p>
          The ingestion endpoint accepts <code className="font-mono text-foreground">pageview</code>
          , <code className="font-mono text-foreground">purchase</code>,{" "}
          <code className="font-mono text-foreground">support_request</code>,{" "}
          <code className="font-mono text-foreground">signup</code>,{" "}
          <code className="font-mono text-foreground">email_open</code>, and{" "}
          <code className="font-mono text-foreground">custom</code>. Contacts and companies are
          upserted from the payload's email and company domain.
        </p>
        <HelpTip>
          The green check next to the endpoint means HMAC verification is on. A red alert means{" "}
          <code className="font-mono">INGEST_WEBHOOK_SECRET</code> is unset — requests are accepted
          unsigned, which is fine for testing but not for production. Set the secret in backend
          config to enable signature checking.
        </HelpTip>
        <p className="text-xs">
          Tip: hit <HelpKbd>?</HelpKbd> on any page to reopen this drawer.
        </p>
      </HelpSection>

      <HelpSection id="integrations-related" title="Related">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Link to="/traffic" className="underline hover:text-foreground">
              Visitor Activity
            </Link>{" "}
            — the live feed of events the tracking snippet produces.
          </li>
          <li>
            <Link to="/developer" className="underline hover:text-foreground">
              CLI / API
            </Link>{" "}
            — API keys and the REST surface for programmatic access.
          </li>
        </ul>
      </HelpSection>
    </div>
  );
}

export const integrationsHelpContent: HelpContent = {
  id: "integrations",
  title: "Tracking & Webhooks",
  eyebrow: "crema / help",
  anchors: [
    { id: "integrations-overview", label: "Overview" },
    { id: "integrations-tracking", label: "Tracking snippet" },
    { id: "integrations-ingest", label: "Activity ingestion" },
    { id: "integrations-related", label: "Related" },
  ],
  component: IntegrationsHelpContent,
};
