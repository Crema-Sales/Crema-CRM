import { Link } from "@tanstack/react-router";

import type { HelpContent } from "@/hooks/use-help";
import {
  HelpKbd,
  HelpSection,
  HelpTip,
  useAnchorScroll,
} from "@/components/help/content/_layout";

export function RelationshipsHelpContent({
  activeAnchor,
}: {
  activeAnchor?: string;
}) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="relationships-overview" title="Overview">
        <p>
          A <span className="text-foreground font-medium">relationship</span>{" "}
          is a contact plus the stage they're in with you. Same database row
          as a contact, different lens — this page surfaces stage and how
          long they've been there, because that's how you decide who to
          touch next.
        </p>
        <p>
          Every non-archived contact appears here. There is no separate
          "relationship" entity to create — you create a contact, and they
          become a relationship at stage <span className="text-foreground font-medium">Lead</span>.
        </p>
      </HelpSection>

      <HelpSection id="relationships-stages" title="Stages">
        <p>Four stages, fixed, in this order:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <span className="text-foreground font-medium">Lead</span> — new,
            unworked. Default for every contact.
          </li>
          <li>
            <span className="text-foreground font-medium">Contact</span> —
            in conversation.
          </li>
          <li>
            <span className="text-foreground font-medium">Deal</span> —
            active opportunity.
          </li>
          <li>
            <span className="text-foreground font-medium">Customer</span> —
            terminal. They don't move past this.
          </li>
        </ul>
        <p>
          Stages advance when a contact's stage tasks are all checked — see
          the funnel for the task mechanics. You can also set a stage by
          hand from the contact detail page.
        </p>
        <p>
          The <span className="text-foreground font-medium">In stage</span>{" "}
          column shows time since they entered the current stage. Long
          numbers on non-customer rows are stuck rows, and they're also
          surfaced on the funnel's Stuck panel.
        </p>
      </HelpSection>

      <HelpSection id="relationships-filtering" title="Filtering the list">
        <p>
          <span className="text-foreground font-medium">Search</span> matches
          name and company name, case-insensitive substring.
        </p>
        <p>
          The stage chips filter to a single stage; the count next to each
          chip is live. <span className="text-foreground font-medium">All</span>{" "}
          clears the stage filter.
        </p>
        <HelpTip>
          The list is sorted by most recent stage change, so the top rows
          are who just moved. Filter to{" "}
          <span className="text-foreground font-medium">Deal</span> when you
          want the people closest to closing.
        </HelpTip>
        <p className="text-xs">
          Tip: hit <HelpKbd>?</HelpKbd> on any page to reopen this drawer.
        </p>
      </HelpSection>

      <HelpSection id="relationships-related" title="Related">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Link to="/funnel" className="underline hover:text-foreground">
              Funnel
            </Link>{" "}
            — the same data grouped by stage, with the tasks that drive
            progression.
          </li>
          <li>
            <Link to="/companies" className="underline hover:text-foreground">
              Companies
            </Link>{" "}
            — the accounts these people belong to.
          </li>
        </ul>
      </HelpSection>
    </div>
  );
}

export const relationshipsHelpContent: HelpContent = {
  id: "relationships",
  title: "Relationships",
  eyebrow: "crema / help",
  anchors: [
    { id: "relationships-overview", label: "Overview" },
    { id: "relationships-stages", label: "Stages" },
    { id: "relationships-filtering", label: "Filtering" },
  ],
  component: RelationshipsHelpContent,
};
