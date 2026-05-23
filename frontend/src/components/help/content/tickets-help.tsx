import { Link } from "@tanstack/react-router";

import type { HelpContent } from "@/hooks/use-help";
import {
  HelpKbd,
  HelpSection,
  HelpTip,
  useAnchorScroll,
} from "@/components/help/content/_layout";

export function TicketsHelpContent({ activeAnchor }: { activeAnchor?: string }) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="tickets-overview" title="Overview">
        <p>
          Tickets are inbound support requests from your contacts. The list
          sorts overdue items to the top, then by priority, then by recency.
          Click a row to open the side panel and reply, reassign, or resolve.
        </p>
        <p>
          The three counters in the header — Open, Overdue, Resolved (7d) —
          are live. The list polls every 15s.
        </p>
      </HelpSection>

      <HelpSection id="tickets-statuses" title="Statuses">
        <p>Four statuses, set on the ticket panel:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <span className="text-foreground font-medium">Open</span> — needs a
            first response. Counts toward the Open stat.
          </li>
          <li>
            <span className="text-foreground font-medium">Pending</span> —
            waiting on the customer. Still counts as open work.
          </li>
          <li>
            <span className="text-foreground font-medium">Resolved</span> —
            you've shipped a fix. Resolving requires a short resolution note.
          </li>
          <li>
            <span className="text-foreground font-medium">Closed</span> — final.
            Use for duplicates or won't-fix.
          </li>
        </ul>
        <p>
          The <span className="text-foreground font-medium">Open</span> tab
          shows Open + Pending. <span className="text-foreground font-medium">Past</span>{" "}
          shows Resolved + Closed. <span className="text-foreground font-medium">All</span>{" "}
          shows everything.
        </p>
      </HelpSection>

      <HelpSection id="tickets-priority" title="Priority">
        <p>
          Four levels, displayed as a coloured badge on each card:{" "}
          <span className="text-foreground font-medium">Urgent</span>,{" "}
          <span className="text-foreground font-medium">High</span>,{" "}
          <span className="text-foreground font-medium">Medium</span>,{" "}
          <span className="text-foreground font-medium">Low</span>. Priority is
          the second sort key after overdue, so urgent items float above older
          ones in the same status.
        </p>
        <p>
          The priority dropdown filters to a single level. Change a ticket's
          priority from the side panel.
        </p>
      </HelpSection>

      <HelpSection id="tickets-assignment" title="Assignment">
        <p>
          Assign a ticket from the side panel's <span className="text-foreground font-medium">Assignee</span>{" "}
          dropdown. Pick a teammate or leave it Unassigned. Assignment doesn't
          notify anyone today — the assigned user sees it next time they hit
          the list.
        </p>
        <p>
          Flip <span className="text-foreground font-medium">Assigned to me</span>{" "}
          to filter the list down to your queue.
        </p>
      </HelpSection>

      <HelpSection id="tickets-sla" title="SLA &amp; overdue">
        <p>
          Each ticket has an SLA due timestamp. The row shows the remaining
          time; within 6 hours it turns amber, past due it turns red and the
          card border picks up a destructive tint with a pulsing icon.
        </p>
        <p>
          Resolving or closing a ticket clears its SLA from the display.
          Overdue items always sort first, regardless of priority — fix the
          fire before the queue.
        </p>
        <HelpTip>
          Toggle <span className="text-foreground font-medium">Overdue only</span>{" "}
          to triage the fire pile. Combine with{" "}
          <span className="text-foreground font-medium">Assigned to me</span>{" "}
          when you're catching up on your own queue.
        </HelpTip>
        <p className="text-xs">
          Tip: hit <HelpKbd>?</HelpKbd> on any page to reopen this drawer.
        </p>
      </HelpSection>

      <HelpSection id="tickets-related" title="Related">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Link to="/today" className="underline hover:text-foreground">
              Today
            </Link>{" "}
            — tickets due today land in your day-of work view.
          </li>
          <li>
            <Link to="/activity" className="underline hover:text-foreground">
              Activity
            </Link>{" "}
            — ticket comments and status changes appear in the feed.
          </li>
        </ul>
      </HelpSection>
    </div>
  );
}

export const ticketsHelpContent: HelpContent = {
  id: "tickets",
  title: "Tickets",
  eyebrow: "crema / help",
  anchors: [
    { id: "tickets-overview", label: "Overview" },
    { id: "tickets-statuses", label: "Statuses" },
    { id: "tickets-priority", label: "Priority" },
    { id: "tickets-assignment", label: "Assignment" },
    { id: "tickets-sla", label: "SLA & overdue" },
  ],
  component: TicketsHelpContent,
};
