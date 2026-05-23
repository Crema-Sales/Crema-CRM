import { Link } from "@tanstack/react-router";

import type { HelpContent } from "@/hooks/use-help";
import { HelpKbd, HelpSection, HelpTip, useAnchorScroll } from "@/components/help/content/_layout";

export function ContactDetailHelpContent({ activeAnchor }: { activeAnchor?: string }) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="contact-overview" title="Overview">
        <p>
          A contact page is one person: their name, role, the company they sit under, and how to
          reach them. The header pulls everything Crema knows about the human side; the cards below
          pull what Crema knows about the work.
        </p>
        <p>
          The <span className="text-foreground font-medium">Lifetime value</span> card on the right
          of the header is the sum of every closed purchase tied to this contact, in dollars. Open
          deals are not included — only money actually booked.
        </p>
        <p>
          The <span className="text-foreground font-medium">Ideal customer</span> badge is a manual
          flag set elsewhere. It doesn't change pricing or routing — it's a marker for "this is the
          persona we want more of."
        </p>
      </HelpSection>

      <HelpSection id="contact-touchpoints" title="Activity timeline">
        <p>
          Every logged interaction with this contact, newest first: calls, emails, meetings, notes,
          and inbound signals. Each row shows the subject and a relative timestamp; the icon on the
          left tells you the channel at a glance.
        </p>
        <p>
          The feed is scoped to this contact only — interactions logged against a colleague at the
          same company will not appear here. For a company-wide view, open the company page or use{" "}
          <Link to="/activity" className="underline hover:text-foreground">
            Activity
          </Link>{" "}
          and filter.
        </p>
        <HelpTip>
          "Signal" rows are inbound events Crema captured without a human logging them — a form
          fill, a doc open, a pricing-page visit. They count as touchpoints but they aren't
          outreach.
        </HelpTip>
        <p>
          There is no inline reply or "log call" affordance on this page today. New activity has to
          be logged from the assistant or via the integrations that feed the timeline.
        </p>
      </HelpSection>

      <HelpSection id="contact-related" title="Company, purchases, and deals">
        <p>The right column groups everything else attached to this contact:</p>
        <p>
          <span className="text-foreground font-medium">Company</span> — the org this contact is
          currently linked to. Click through to see siblings, deals, and aggregate activity. If the
          company is blank, the contact isn't linked — Crema does not auto-link by email domain.
        </p>
        <p>
          <span className="text-foreground font-medium">Purchases</span> — every closed transaction
          tied to this contact, with the product label and amount. This is what feeds the Lifetime
          value number in the header.
        </p>
        <p>
          <span className="text-foreground font-medium">Deals</span> — every deal where this contact
          is the named counterpart, including open ones. The stage badge mirrors the labels on the{" "}
          <Link to="/funnel" className="underline hover:text-foreground">
            funnel board
          </Link>
          ; moves happen there, not here.
        </p>
        <p className="text-xs">
          Tip: hit <HelpKbd>?</HelpKbd> on any page to reopen this drawer.
        </p>
      </HelpSection>
    </div>
  );
}

export const contactDetailHelpContent: HelpContent = {
  id: "contact-detail",
  title: "Contact detail",
  eyebrow: "crema / help",
  anchors: [
    { id: "contact-overview", label: "Overview" },
    { id: "contact-touchpoints", label: "Activity timeline" },
    { id: "contact-related", label: "Company, purchases, deals" },
  ],
  component: ContactDetailHelpContent,
};
