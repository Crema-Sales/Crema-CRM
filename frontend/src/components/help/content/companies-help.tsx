import { Link } from "@tanstack/react-router";

import type { HelpContent } from "@/hooks/use-help";
import {
  HelpKbd,
  HelpSection,
  HelpTip,
  useAnchorScroll,
} from "@/components/help/content/_layout";

export function CompaniesHelpContent({ activeAnchor }: { activeAnchor?: string }) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="companies-overview" title="Overview">
        <p>
          A company is one account record. Contacts and deals attach to it so
          you can see the people and the money on the same row.
        </p>
        <p>
          Companies are <span className="text-foreground font-medium">always created by hand</span>{" "}
          today — Crema does not infer them from contact email domains, and it
          will not merge two records that look like duplicates. The list is
          exactly what you put in.
        </p>
      </HelpSection>

      <HelpSection id="companies-stats" title="The four counters">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <span className="text-foreground font-medium">Companies</span> —
            total rows in the table.
          </li>
          <li>
            <span className="text-foreground font-medium">Contacts</span> —
            non-archived contacts that are linked to any company.
          </li>
          <li>
            <span className="text-foreground font-medium">Deals</span> — every
            deal with a company attached, regardless of stage.
          </li>
          <li>
            <span className="text-foreground font-medium">Open pipeline</span>{" "}
            — summed value of deals not yet won or lost.
          </li>
        </ul>
        <p>
          Contacts without a company and deals without a company are real, just
          not counted here. Link them from the contact or deal page.
        </p>
      </HelpSection>

      <HelpSection id="companies-search" title="Searching the list">
        <p>
          One search box, matching against{" "}
          <span className="text-foreground font-medium">name</span>,{" "}
          <span className="text-foreground font-medium">domain</span>, and{" "}
          <span className="text-foreground font-medium">industry</span>, and{" "}
          <span className="text-foreground font-medium">location</span> at
          once. Case-insensitive substring — "acme" finds "Acme Inc.",
          "acme.com", and any industry or location containing the letters.
        </p>
        <p>
          No saved views, no column sorting, no filters beyond the search.
          The list is sorted alphabetically by name.
        </p>
      </HelpSection>

      <HelpSection id="companies-create" title="Adding a company">
        <p>
          <span className="text-foreground font-medium">New company</span>{" "}
          opens a dialog with five fields. Only the name is required; the
          others are notes for you and your team.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <span className="text-foreground font-medium">Domain</span> — used
            for the row subtitle and search. Free text, no validation.
          </li>
          <li>
            <span className="text-foreground font-medium">Industry</span>,{" "}
            <span className="text-foreground font-medium">Location</span>,{" "}
            <span className="text-foreground font-medium">Employees</span>,{" "}
            <span className="text-foreground font-medium">Notes</span> — for
            context. None of them feed any other logic today.
          </li>
        </ul>
        <HelpTip>
          Nothing stops you from creating "Acme" and "Acme Inc." as separate
          rows. There is no merge tool — pick a canonical name before you
          start adding contacts.
        </HelpTip>
        <p className="text-xs">
          Tip: hit <HelpKbd>?</HelpKbd> on any page to reopen this drawer.
        </p>
      </HelpSection>

      <HelpSection id="companies-related" title="Related">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Link to="/relationships" className="underline hover:text-foreground">
              Relationships
            </Link>{" "}
            — the people, with the company they belong to in the company column.
          </li>
          <li>
            <Link to="/funnel" className="underline hover:text-foreground">
              Funnel
            </Link>{" "}
            — what stage each contact at a company is in.
          </li>
        </ul>
      </HelpSection>
    </div>
  );
}

export const companiesHelpContent: HelpContent = {
  id: "companies",
  title: "Companies",
  eyebrow: "crema / help",
  anchors: [
    { id: "companies-overview", label: "Overview" },
    { id: "companies-stats", label: "The four counters" },
    { id: "companies-search", label: "Searching" },
    { id: "companies-create", label: "Adding a company" },
  ],
  component: CompaniesHelpContent,
};
