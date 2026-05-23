import { Link } from "@tanstack/react-router";

import type { HelpContent } from "@/hooks/use-help";
import {
  HelpKbd,
  HelpSection,
  HelpTip,
  useAnchorScroll,
} from "@/components/help/content/_layout";

export function DealsHelpContent({ activeAnchor }: { activeAnchor?: string }) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="deals-overview" title="Overview">
        <p>
          A deal is one piece of revenue you're chasing — a name, a dollar
          value, and a stage. The board is a kanban: six columns, one card per
          deal, money moving left to right.
        </p>
        <p>
          This board tracks <span className="text-foreground font-medium">deals</span>,
          which is not the same as the{" "}
          <Link to="/funnel" className="underline hover:text-foreground">
            funnel
          </Link>
          . The funnel stages a <span className="text-foreground font-medium">contact's</span>{" "}
          relationship; deal stages track the <span className="text-foreground font-medium">money</span>.
          A contact and a deal can sit at different points.
        </p>
      </HelpSection>

      <HelpSection id="deals-stages" title="The six stages">
        <p>
          Discovery, Qualified, Proposal, Closing, Won, Lost. Drag a card into
          a column to move it — the change saves immediately and rolls back if
          the server rejects it.
        </p>
        <p>
          Each stage carries a fixed <span className="text-foreground font-medium">confidence
          percentage</span> set by the org. You don't edit a deal's probability
          directly; it snaps to whatever the stage implies. Move the deal, the
          number follows.
        </p>
      </HelpSection>

      <HelpSection id="deals-pipeline" title="Open pipeline & subtotals">
        <p>
          <span className="text-foreground font-medium">Open pipeline</span>{" "}
          in the header sums the value of every deal that isn't Won or Lost.
          Closed deals — either direction — drop out of that number.
        </p>
        <p>
          Each column header shows its own count and dollar subtotal, so Won
          and Lost still total up even though they don't feed open pipeline.
        </p>
      </HelpSection>

      <HelpSection id="deals-create" title="Creating & opening a deal">
        <p>
          <span className="text-foreground font-medium">Create Deal</span>{" "}
          opens a dialog — name and value are required, stage defaults to
          Discovery, company and contact are optional links you can add later.
        </p>
        <p>
          <span className="text-foreground font-medium">Double-click</span> a
          card for the quick-edit slide-over; click the deal name to open the
          full detail page. The company and contact lines on a card are their
          own links.
        </p>
        <HelpTip>
          A deal with no company or contact is valid — Crema won't infer them.
          The card just reads "no company" until you link one.
        </HelpTip>
        <p className="text-xs">
          Tip: hit <HelpKbd>?</HelpKbd> on any page to reopen this drawer.
        </p>
      </HelpSection>
    </div>
  );
}

export const dealsHelpContent: HelpContent = {
  id: "deals",
  title: "Deals",
  eyebrow: "crema / help",
  anchors: [
    { id: "deals-overview", label: "Overview" },
    { id: "deals-stages", label: "The six stages" },
    { id: "deals-pipeline", label: "Open pipeline" },
    { id: "deals-create", label: "Creating a deal" },
  ],
  component: DealsHelpContent,
};
