import { Link } from "@tanstack/react-router";

import type { HelpContent } from "@/hooks/use-help";
import {
  HelpKbd,
  HelpSection,
  HelpTip,
  useAnchorScroll,
} from "@/components/help/content/_layout";

export function CompanyDetailHelpContent({ activeAnchor }: { activeAnchor?: string }) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="company-overview" title="Overview">
        <p>
          A company page is one account viewed from every angle Crema knows
          about: the four counters at the top, the editable details on the
          left, and the people / deals / activity stacked on the right.
        </p>
        <p>
          The four counters —{" "}
          <span className="text-foreground font-medium">Contacts</span>,{" "}
          <span className="text-foreground font-medium">Deals</span>,{" "}
          <span className="text-foreground font-medium">Open pipeline</span>,{" "}
          <span className="text-foreground font-medium">Closed won</span> — are
          scoped to this company only. Open pipeline excludes won and lost
          deals; closed won is summed dollar value, lifetime.
        </p>
        <p>
          The details card on the left edits the company record itself.
          Changes are <span className="text-foreground font-medium">not</span>{" "}
          autosaved — hit <span className="text-foreground font-medium">Save changes</span>{" "}
          or your edits vanish on navigate.
        </p>
      </HelpSection>

      <HelpSection id="company-people" title="Contacts at this company">
        <p>
          Every contact whose company field points at this record. The right
          column shows their title and current relationship stage (cold,
          warm, qualified, etc.). Click a name to jump to that contact.
        </p>
        <p>
          Contacts that work here but aren't linked won't appear. Crema does
          not auto-link by email domain — you have to set the company on the
          contact page yourself.
        </p>
      </HelpSection>

      <HelpSection id="company-deals" title="Deals on this company">
        <p>
          Every deal attached to this company, regardless of stage. The
          stage column on the right uses the same labels as the funnel
          board, so you can read this list and the funnel side-by-side
          without translation.
        </p>
        <p>
          To move a deal between stages, do it from{" "}
          <Link to="/funnel" className="underline hover:text-foreground">
            Funnel
          </Link>{" "}
          — this list is read-only.
        </p>
      </HelpSection>

      <HelpSection id="company-activity" title="Recent activity">
        <p>
          Calls, emails, and meetings whose linked contact belongs to this
          company. Scoped narrowly — an activity logged against a contact
          who later moved to a different company stays on the old company's
          feed, because the link was made at the time of logging.
        </p>
        <p>
          For a company-wide view across all touchpoints regardless of who's
          where now, use{" "}
          <Link to="/activity" className="underline hover:text-foreground">
            Activity
          </Link>{" "}
          and filter by contact.
        </p>
        <HelpTip>
          The feed only shows the most recent few items — there is no
          "show all" today. If you need history, go to the contact page or
          use the assistant to query.
        </HelpTip>
        <p className="text-xs">
          Tip: hit <HelpKbd>?</HelpKbd> on any page to reopen this drawer.
        </p>
      </HelpSection>
    </div>
  );
}

export const companyDetailHelpContent: HelpContent = {
  id: "company-detail",
  title: "Company detail",
  eyebrow: "crema / help",
  anchors: [
    { id: "company-overview", label: "Overview" },
    { id: "company-people", label: "Contacts at this company" },
    { id: "company-deals", label: "Deals on this company" },
    { id: "company-activity", label: "Recent activity" },
  ],
  component: CompanyDetailHelpContent,
};
