import { Link } from "@tanstack/react-router";

import type { HelpContent } from "@/hooks/use-help";
import {
  HelpKbd,
  HelpSection,
  HelpTip,
  useAnchorScroll,
} from "@/components/help/content/_layout";

export function ActivityHelpContent({
  activeAnchor,
}: {
  activeAnchor?: string;
}) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="activity-overview" title="Overview">
        <p>
          A reverse-chronological feed of everything that's happened across
          the workspace — calls, emails, meetings, notes, and the signals
          Crema picks up on its own. The 100 most recent events.
        </p>
        <p>
          Each row shows the subject, an optional body, the event type, the
          contact involved (or{" "}
          <span className="text-foreground font-medium">system</span> if it's
          machine-generated), and when it happened.
        </p>
      </HelpSection>

      <HelpSection id="activity-event-types" title="Event types">
        <p>Six types, each with its own icon:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <span className="text-foreground font-medium">email</span> — an
            email sent or received that was logged against a contact.
          </li>
          <li>
            <span className="text-foreground font-medium">call</span> — a
            phone call, logged by hand.
          </li>
          <li>
            <span className="text-foreground font-medium">meeting</span> — a
            meeting, logged by hand or from a calendar sync.
          </li>
          <li>
            <span className="text-foreground font-medium">note</span> — a
            free-form note you wrote on a contact or deal.
          </li>
          <li>
            <span className="text-foreground font-medium">signal</span> —
            something Crema noticed without you doing anything: a pricing
            page view, a doc share, a tracked link click.
          </li>
          <li>
            <span className="text-foreground font-medium">system</span> —
            automation events. Stage changes, auto-advances, lead scoring
            updates.
          </li>
        </ul>
        <HelpTip>
          Logging a call or note from a contact's page adds the row here
          immediately. The feed is the receipt — if it's not in activity, it
          didn't happen as far as Crema is concerned.
        </HelpTip>
      </HelpSection>

      <HelpSection id="activity-filters" title="Filtering">
        <p>
          No filters today. The feed is a flat list of the 100 most recent
          events across every contact and deal in the workspace.
        </p>
        <p>
          For the activity on one person or one deal, open that contact or
          deal's detail page — both have their own scoped feed.
        </p>
        <p className="text-xs">
          Tip: hit <HelpKbd>?</HelpKbd> on any page to reopen this drawer.
        </p>
      </HelpSection>

      <HelpSection id="activity-related" title="Related">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Link to="/funnel" className="underline hover:text-foreground">
              Funnel
            </Link>{" "}
            — stage changes show up here as{" "}
            <span className="text-foreground font-medium">system</span>{" "}
            events.
          </li>
          <li>
            <Link to="/traffic" className="underline hover:text-foreground">
              Visitor Activity
            </Link>{" "}
            — the raw web events that some{" "}
            <span className="text-foreground font-medium">signal</span> rows
            are summarised from.
          </li>
        </ul>
      </HelpSection>
    </div>
  );
}

export const activityHelpContent: HelpContent = {
  id: "activity",
  title: "Activity",
  eyebrow: "crema / help",
  anchors: [
    { id: "activity-overview", label: "Overview" },
    { id: "activity-event-types", label: "Event types" },
    { id: "activity-filters", label: "Filtering" },
  ],
  component: ActivityHelpContent,
};
