import { Link } from "@tanstack/react-router";

import type { HelpContent } from "@/hooks/use-help";
import {
  HelpSection,
  HelpTip,
  useAnchorScroll,
} from "@/components/help/content/_layout";

export function SettingsHelpContent({
  activeAnchor,
}: {
  activeAnchor?: string;
}) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="settings-overview" title="Overview">
        <p>
          Three tabs:{" "}
          <span className="text-foreground font-medium">User</span> is your own
          profile,{" "}
          <span className="text-foreground font-medium">Organization</span> is
          the company you share data with, and{" "}
          <span className="text-foreground font-medium">Prompts</span> tunes the
          AI copilot. Tracking, webhooks, and the browser extension each have
          their own sidebar page now — see{" "}
          <Link to="/integrations" className="underline hover:text-foreground">
            Tracking &amp; Webhooks
          </Link>
          .
        </p>
      </HelpSection>

      <HelpSection id="settings-user" title="User">
        <p>
          Just your display name and your title — both are free text. Roles
          show as read-only badges above the form; you can't change your own
          roles from here.
        </p>
        <p>
          <span className="text-foreground font-medium">Save changes</span>{" "}
          writes both fields. There's no per-field save and no email/password
          edit on this screen — auth identity is managed by the sign-in
          provider.
        </p>
      </HelpSection>

      <HelpSection id="settings-organization" title="Organization">
        <p>
          Org name and logo URL. The name shows wherever the workspace is
          named; the logo URL is loaded directly from the URL you paste, so
          host it somewhere stable (S3, your CDN, a public image host).
        </p>
        <p>
          The member counter in the section header is the source of truth for
          how many seats are in use. Below the org form is the invite +
          members section — see{" "}
          <span className="text-foreground font-medium">Members</span> below.
        </p>
      </HelpSection>

      <HelpSection id="settings-members" title="Members &amp; invites">
        <p>
          <span className="text-foreground font-medium">Send invite</span>{" "}
          generates a single-use link tied to that email. The link sits in the{" "}
          <span className="text-foreground font-medium">Pending</span> list
          until accepted — copy it with the clipboard button and send it
          yourself; Crema does not email invites today.
        </p>
        <p>
          Everyone in an org is an admin right now. Anyone can invite, anyone
          can remove. Role-based access is on the roadmap.
        </p>
        <p>
          The trash icon next to a member opens a confirm dialog and removes
          them on confirm. Records that member created — contacts, deals,
          notes, tickets — <span className="text-foreground font-medium">stay
          in place</span>; only their access goes away.
        </p>
        <HelpTip>
          Removing yourself is a "leave" — Crema rewords the dialog and, on
          confirm, sends you to onboarding (or the next org you belong to).
          You can be re-invited later by anyone still on the team.
        </HelpTip>
      </HelpSection>

      <HelpSection id="settings-related" title="Related">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <Link to="/traffic" className="underline hover:text-foreground">
              Visitor Activity
            </Link>{" "}
            — the live feed of events the tracking snippet produces.
          </li>
          <li>
            <Link to="/activity" className="underline hover:text-foreground">
              Activity
            </Link>{" "}
            — events from the ingestion webhook land here.
          </li>
        </ul>
      </HelpSection>
    </div>
  );
}

export const settingsHelpContent: HelpContent = {
  id: "settings",
  title: "Settings",
  eyebrow: "crema / help",
  anchors: [
    { id: "settings-overview", label: "Overview" },
    { id: "settings-user", label: "User" },
    { id: "settings-organization", label: "Organization" },
    { id: "settings-members", label: "Members & invites" },
  ],
  component: SettingsHelpContent,
};
