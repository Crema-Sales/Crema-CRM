import { Link } from "@tanstack/react-router";

import type { HelpContent } from "@/hooks/use-help";
import {
  HelpKbd,
  HelpSection,
  HelpTip,
  useAnchorScroll,
} from "@/components/help/content/_layout";

export function FunnelHelpContent({ activeAnchor }: { activeAnchor?: string }) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="funnel-overview" title="Overview">
        <p>
          The funnel groups every active relationship by stage. Each card is one
          contact, with progress on the tasks Crema expects you to finish before
          they advance.
        </p>
        <p>
          Cards do not move by dragging. Finish a stage's required tasks and the
          contact drips down to the next stage on its own.
        </p>
      </HelpSection>

      <HelpSection id="funnel-stages" title="Stages">
        <p>Four stages, fixed order, left-to-right in your head:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <span className="text-foreground font-medium">Lead</span> — warming
            up. You have a name and a reason to reach out.
          </li>
          <li>
            <span className="text-foreground font-medium">Contact</span> — in
            conversation. They've replied or you've spoken.
          </li>
          <li>
            <span className="text-foreground font-medium">Deal</span> — on the
            bench. Active opportunity with a path to close.
          </li>
          <li>
            <span className="text-foreground font-medium">Customer</span> —
            terminal. Brewed. Nothing moves past this.
          </li>
        </ul>
        <p>
          Custom stages aren't on the menu today. If your team works a different
          shape, run it through these four.
        </p>
      </HelpSection>

      <HelpSection id="funnel-progression" title="Moving a deal">
        <p>
          Each card lists the required tasks for its stage. Hover the card to
          see them, click a checkbox to mark one done. When all required tasks
          are complete, the contact moves to the next stage and the activity
          feed picks up the change.
        </p>
        <p>
          <span className="text-foreground font-medium">Brew next step</span>{" "}
          (on the band header) ticks the next required task on every card in
          that stage at once. Useful for bulk-advancing after a real-world push
          like a campaign send.
        </p>
        <p>
          To drop a contact out of the funnel entirely, hover the card and use
          the archive button — confirmed via dialog as{" "}
          <span className="text-foreground font-medium">Disqualify</span>. They
          leave the funnel but stay in archived records.
        </p>
        <HelpTip>
          There is no undo. Disqualify reversibly archives — you can find the
          contact again under archived records — but a wrongly auto-advanced
          stage has to be corrected manually on the contact page.
        </HelpTip>
      </HelpSection>

      <HelpSection id="funnel-stuck" title="Stuck panel">
        <p>
          The <span className="text-foreground font-medium">Stuck</span> button
          in the header opens a side panel listing every non-customer contact
          that has spent more than 7 days in its current stage. The count
          pulses when anything is stuck.
        </p>
        <p>
          Click a stuck row to jump to that contact and either move it forward
          (finish a task) or disqualify it.
        </p>
        <p className="text-xs">
          Tip: hit <HelpKbd>?</HelpKbd> on any page to reopen this drawer.
        </p>
      </HelpSection>

      <HelpSection id="funnel-related" title="Related">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Link to="/today" className="underline hover:text-foreground">
              Today
            </Link>{" "}
            — the tasks driving stage progression, scoped to what's due now.
          </li>
          <li>
            <Link to="/activity" className="underline hover:text-foreground">
              Activity
            </Link>{" "}
            — the feed of stage changes and other events.
          </li>
        </ul>
      </HelpSection>
    </div>
  );
}

export const funnelHelpContent: HelpContent = {
  id: "funnel",
  title: "The Funnel",
  eyebrow: "crema / help",
  anchors: [
    { id: "funnel-overview", label: "Overview" },
    { id: "funnel-stages", label: "Stages" },
    { id: "funnel-progression", label: "Moving a deal" },
    { id: "funnel-stuck", label: "Stuck panel" },
  ],
  component: FunnelHelpContent,
};
