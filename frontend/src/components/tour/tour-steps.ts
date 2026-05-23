// Tour step config. Each step either highlights an element via `target`
// (a [data-tour-id="..."] selector) or renders as a centered card via `intro`.
export type TourStep = {
  id: string;
  /** Render a centered, full-screen card instead of a spotlight cutout. */
  intro?: boolean;
  /** CSS selector for the element to spotlight. Ignored when intro=true. */
  target?: string;
  title: string;
  body: string;
  /** Preferred placement of the popover relative to the highlighted element. */
  placement?: "right" | "left" | "top" | "bottom";
  /** Padding (px) around the target rect for the cutout. Default 8. */
  padding?: number;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    intro: true,
    title: "Welcome to Crema.",
    body:
      "A CRM that cares about the finish, not just the function. Take a quick tour to see how relationships brew through the funnel — or skip and dive in.",
  },
  {
    id: "sidebar",
    target: '[data-tour-id="sidebar"]',
    placement: "right",
    title: "Your workspace",
    body:
      "Everything lives in this sidebar — the funnel, visitor activity, today's plan, your people, deals, and settings. Click anything to jump.",
  },
  {
    id: "funnel-nav",
    target: '[data-tour-id="nav-funnel"]',
    placement: "right",
    title: "The Funnel",
    body:
      "Where every relationship lives. Lead → Contact → Deal → Customer. Finish a stage's required tasks and the relationship advances on its own.",
  },
  {
    id: "traffic-nav",
    target: '[data-tour-id="nav-traffic"]',
    placement: "right",
    title: "Visitor Activity",
    body:
      "Where new leads come from: web visits, signups, and any source pushing into Crema's ingest endpoint.",
  },
  {
    id: "today-nav",
    target: '[data-tour-id="nav-today"]',
    placement: "right",
    title: "Today",
    body:
      "Your prioritized action list. The handful of things you actually need to do right now.",
  },
  {
    id: "relationships-nav",
    target: '[data-tour-id="nav-relationships"]',
    placement: "right",
    title: "Relationships",
    body:
      "A full directory of every contact you've ever talked to, with their company, stage, and activity.",
  },
  {
    id: "tickets-nav",
    target: '[data-tour-id="nav-tickets"]',
    placement: "right",
    title: "Tickets",
    body:
      "Open and past support tickets, ranked by SLA. Overdue items glow red so they don't get forgotten.",
  },
  {
    id: "settings-nav",
    target: '[data-tour-id="nav-settings"]',
    placement: "right",
    title: "Settings",
    body:
      "Your profile, organization, and the technical bits — webhooks and the tracking snippet you paste on your site to feed leads in.",
  },
  {
    id: "topbar",
    target: '[data-tour-id="topbar"]',
    placement: "bottom",
    title: "Top bar",
    body:
      "Collapse the sidebar from here. The crumbs on the right show where you are in the app.",
  },
  {
    id: "assistant",
    target: '[data-tour-id="assistant-bubble"]',
    placement: "left",
    title: "The barista",
    body:
      "Your AI copilot lives here. It sees the same records you do, can act on the same API, and knows your day. Hit it with questions or let it suggest the next step.",
  },
  {
    id: "outro",
    intro: true,
    title: "You're set.",
    body:
      "That's the whole shape of it. You can restart this tour anytime from Settings → User. Now go brew something.",
  },
];
