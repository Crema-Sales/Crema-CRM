import { Link } from "@tanstack/react-router";

import type { HelpContent } from "@/hooks/use-help";
import { HelpKbd, HelpSection, HelpTip, useAnchorScroll } from "@/components/help/content/_layout";

export function DealDetailHelpContent({ activeAnchor }: { activeAnchor?: string }) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="deal-overview" title="Overview">
        <p>
          One deal in full: the editable details card on the left, the four
          stat tiles up top, and everything attached to it on the right.
        </p>
        <p>
          The four tiles — <span className="text-foreground font-medium">Value</span>,{" "}
          <span className="text-foreground font-medium">Probability</span>,{" "}
          <span className="text-foreground font-medium">Expected close</span>, and{" "}
          <span className="text-foreground font-medium">Activities</span> — are
          read-only summaries. Probability is whatever the current stage
          implies; it isn't a field you set.
        </p>
      </HelpSection>

      <HelpSection id="deal-editing" title="Editing the deal">
        <p>
          Name, value, expected close, company, and contact all live in the
          Details card. They're staged locally — nothing persists until you
          hit <span className="text-foreground font-medium">Save changes</span>.
        </p>
        <p>
          <span className="text-foreground font-medium">Stage</span> is the
          exception: picking a new stage from the dropdown saves on the spot,
          no Save button needed. That mirrors dragging a card on the{" "}
          <Link to="/deals" className="underline hover:text-foreground">
            deals board
          </Link>
          .
        </p>
        <HelpTip>
          Save is disabled until the deal has a name. An empty value field
          saves as $0 rather than blocking you.
        </HelpTip>
      </HelpSection>

      <HelpSection id="deal-related" title="Linked records & activity">
        <p>
          <span className="text-foreground font-medium">Linked records</span>{" "}
          shows the company and contact attached to this deal, each a link
          through to its own page. The card is hidden entirely when nothing is
          linked.
        </p>
        <p>
          <span className="text-foreground font-medium">Activity</span> is the
          interaction log scoped to this deal, newest first. It's read-only
          here — new activity is logged through the assistant or the
          integrations that feed the timeline, not from this page.
        </p>
        <p className="text-xs">
          Tip: hit <HelpKbd>?</HelpKbd> on any page to reopen this drawer.
        </p>
      </HelpSection>
    </div>
  );
}

export const dealDetailHelpContent: HelpContent = {
  id: "deal-detail",
  title: "Deal detail",
  eyebrow: "crema / help",
  anchors: [
    { id: "deal-overview", label: "Overview" },
    { id: "deal-editing", label: "Editing the deal" },
    { id: "deal-related", label: "Linked records & activity" },
  ],
  component: DealDetailHelpContent,
};
