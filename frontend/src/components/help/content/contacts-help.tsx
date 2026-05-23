import { Link } from "@tanstack/react-router";

import type { HelpContent } from "@/hooks/use-help";
import {
  HelpKbd,
  HelpSection,
  HelpTip,
  useAnchorScroll,
} from "@/components/help/content/_layout";

export function ContactsHelpContent({ activeAnchor }: { activeAnchor?: string }) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="contacts-overview" title="Overview">
        <p>
          Every person Crema knows about, one row each: name, company, stage,
          and how to reach them. Click a row to open the full{" "}
          <Link to="/contacts" className="underline hover:text-foreground">
            contact page
          </Link>
          .
        </p>
        <p>
          A contact can stand alone — no company is required. Crema does not
          link people to companies by email domain; that link is something you
          set by hand.
        </p>
      </HelpSection>

      <HelpSection id="contacts-stats" title="The four counters">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <span className="text-foreground font-medium">Contacts</span> —
            every row in the table.
          </li>
          <li>
            <span className="text-foreground font-medium">ICPs</span> —
            contacts flagged as an ideal customer profile.
          </li>
          <li>
            <span className="text-foreground font-medium">In deal</span> —
            contacts whose relationship stage is "deal".
          </li>
          <li>
            <span className="text-foreground font-medium">Customers</span> —
            contacts whose relationship stage is "customer".
          </li>
        </ul>
        <p>
          Stage here is the contact's <span className="text-foreground font-medium">relationship</span>{" "}
          stage — lead, contact, deal, customer — and it's separate from the
          money-tracking stages on the{" "}
          <Link to="/deals" className="underline hover:text-foreground">
            deals board
          </Link>
          .
        </p>
      </HelpSection>

      <HelpSection id="contacts-search" title="Searching the list">
        <p>
          One search box, matching <span className="text-foreground font-medium">name</span>,{" "}
          <span className="text-foreground font-medium">email</span>,{" "}
          <span className="text-foreground font-medium">title</span>, and{" "}
          <span className="text-foreground font-medium">company name</span> at
          once. Case-insensitive substring — no saved views, no column sorting.
        </p>
      </HelpSection>

      <HelpSection id="contacts-keyboard" title="Keyboard & creating">
        <p>The list is keyboard-drivable:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <HelpKbd>j</HelpKbd> / <HelpKbd>k</HelpKbd> — move down / up rows.
          </li>
          <li>
            <HelpKbd>enter</HelpKbd> — open the highlighted contact.
          </li>
          <li>
            <HelpKbd>/</HelpKbd> — jump to the search box.
          </li>
          <li>
            <HelpKbd>n</HelpKbd> — open the New contact dialog.
          </li>
        </ul>
        <HelpTip>
          New contact needs only a full name. Email, phone, title, and company
          are optional and editable later from the contact page.
        </HelpTip>
        <p className="text-xs">
          Tip: hit <HelpKbd>?</HelpKbd> on any page to reopen this drawer.
        </p>
      </HelpSection>
    </div>
  );
}

export const contactsHelpContent: HelpContent = {
  id: "contacts",
  title: "Contacts",
  eyebrow: "crema / help",
  anchors: [
    { id: "contacts-overview", label: "Overview" },
    { id: "contacts-stats", label: "The four counters" },
    { id: "contacts-search", label: "Searching" },
    { id: "contacts-keyboard", label: "Keyboard & creating" },
  ],
  component: ContactsHelpContent,
};
