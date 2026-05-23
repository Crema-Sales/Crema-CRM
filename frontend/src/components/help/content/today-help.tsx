import { Link } from "@tanstack/react-router";

import type { HelpContent } from "@/hooks/use-help";
import {
  HelpKbd,
  HelpSection,
  HelpTip,
  useAnchorScroll,
} from "@/components/help/content/_layout";

export function TodayHelpContent({ activeAnchor }: { activeAnchor?: string }) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="today-overview" title="Overview">
        <p>
          Today is the short list of relationships and tasks that actually
          need your hands. Crema has already moved everything it can on its
          own; this page is what's left.
        </p>
        <p>
          The page is scoped to you — tasks here are the ones owned by your
          user. The relationship sections pull from the same workspace data
          everyone sees.
        </p>
      </HelpSection>

      <HelpSection id="today-what-shows" title="What shows up here">
        <p>Two sections:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <span className="text-foreground font-medium">Top relationships</span>{" "}
            — your relationships ranked by expected open-deal pipeline value
            (deal value × probability, summed across deals not yet won or lost).
          </li>
          <li>
            <span className="text-foreground font-medium">Open tasks</span> —
            every task assigned to you that isn't done yet, urgent priorities
            first, then overdue, then by due date.
          </li>
        </ul>
        <p>
          Click a relationship row to jump to the relationships list.
        </p>
      </HelpSection>

      <HelpSection id="today-actions" title="What to do here">
        <p>
          Tick a task's checkbox to mark it done. Task completions are how
          relationships advance stages — finishing a stage's required tasks
          drips the contact down the funnel. If the list goes empty,
          everything else is parked in Crema for now.
        </p>
        <HelpTip>
          There are no filters on this page. If you want to slice by stage
          or company, go to the funnel or relationships list — Today is
          deliberately the short answer to "what now?".
        </HelpTip>
        <p className="text-xs">
          Tip: hit <HelpKbd>?</HelpKbd> on any page to reopen this drawer.
        </p>
      </HelpSection>

      <HelpSection id="today-related" title="Related">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Link to="/funnel" className="underline hover:text-foreground">
              Funnel
            </Link>{" "}
            — the same stage data, all relationships, with the tasks behind
            the scenes.
          </li>
          <li>
            <Link to="/activity" className="underline hover:text-foreground">
              Activity
            </Link>{" "}
            — what got logged after you finished a task here.
          </li>
        </ul>
      </HelpSection>
    </div>
  );
}

export const todayHelpContent: HelpContent = {
  id: "today",
  title: "Today",
  eyebrow: "crema / help",
  anchors: [
    { id: "today-overview", label: "Overview" },
    { id: "today-what-shows", label: "What shows up" },
    { id: "today-actions", label: "What to do" },
  ],
  component: TodayHelpContent,
};
