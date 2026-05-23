import * as React from "react";
import { Link } from "@tanstack/react-router";

import { readRecentHelp, type RecentHelpEntry } from "./help-storage";

type NavDestination = {
  to: string;
  label: string;
  summary: string;
};

const NAV_DESTINATIONS: NavDestination[] = [
  {
    to: "/funnel",
    label: "Funnel",
    summary: "Move deals through pipeline stages and spot what's stuck.",
  },
  {
    to: "/today",
    label: "Today",
    summary: "Your daily focus list of follow-ups, tasks, and meetings.",
  },
  {
    to: "/tickets",
    label: "Tickets",
    summary: "Triage and resolve customer support requests.",
  },
  {
    to: "/companies",
    label: "Companies",
    summary: "Browse accounts and the people who work there.",
  },
  {
    to: "/relationships",
    label: "Relationships",
    summary: "Track every contact and how warm the connection is.",
  },
  {
    to: "/activity",
    label: "Activity",
    summary: "A timeline of recent touchpoints across the workspace.",
  },
  {
    to: "/traffic",
    label: "Visitor Activity",
    summary: "See where new leads are coming from and what's converting.",
  },
  {
    to: "/settings",
    label: "Settings",
    summary: "Manage your profile, organization, and technical config.",
  },
];

export function DefaultHelpContent() {
  // Read recents once on mount. The welcome screen only renders when no route
  // help is registered (route transitions, post-logout, etc.), so we don't
  // need to keep the list live across writes inside the same render.
  const [recent, setRecent] = React.useState<RecentHelpEntry[]>([]);
  React.useEffect(() => {
    setRecent(readRecentHelp());
  }, []);

  return (
    <div className="space-y-5 py-4 text-sm">
      <p className="text-muted-foreground leading-relaxed">
        Open this drawer on any page to see what you can do there. Hit{" "}
        <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted/60">
          ?
        </kbd>{" "}
        anywhere to open it. Click the small{" "}
        <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted/60">
          ?
        </kbd>{" "}
        next to a control to jump straight to that section.
      </p>

      {recent.length > 0 && (
        <div className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            recently viewed help
          </div>
          <ul className="space-y-2">
            {recent.map((item) => (
              <li key={item.id}>
                {/*
                  The rendered URL matches `getDeepLink(item.path, item.id)`;
                  we use Link's `to` + `search` props (rather than passing the
                  full URL string) so router state stays in sync with the new
                  search params on navigation.
                */}
                <Link
                  to={item.path}
                  search={{ help: item.id }}
                  className="block rounded-md px-2 py-1.5 -mx-2 hover:bg-accent transition-colors"
                >
                  <div className="font-medium text-foreground">{item.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{item.path}</div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          where to go
        </div>
        <ul className="space-y-2">
          {NAV_DESTINATIONS.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className="block rounded-md px-2 py-1.5 -mx-2 hover:bg-accent transition-colors"
              >
                <div className="font-medium text-foreground">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.summary}</div>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="pt-2 text-xs text-muted-foreground">
        <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted/60">
          ?
        </kbd>{" "}
        press anywhere to open help
      </div>
    </div>
  );
}
