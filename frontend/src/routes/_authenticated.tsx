import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { HelpCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/app-sidebar";
import { AssistantBubble, AssistantProvider, useAssistant } from "@/components/assistant-bubble";
import { TourProvider } from "@/components/tour/tour-context";
import { TourOverlay } from "@/components/tour/tour-overlay";
import { TourWelcomePrompt } from "@/components/tour/tour-welcome-prompt";
import { TourAutoStart } from "@/components/tour/tour-auto-start";
import { OnboardingConversation } from "@/components/onboarding/onboarding-conversation";
import { HelpProvider, useHelp } from "@/hooks/use-help";
import { HelpDrawer, HelpDockedPanel } from "@/components/help/help-drawer";
import { PeekProvider } from "@/components/peek/peek-context";
import { PeekHost } from "@/components/peek/peek-host";
import { CommandPalette } from "@/components/command-palette";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { KbdHint } from "@/components/kbd-hint";
import {
  ShortcutsProvider,
  useRegisterShortcut,
  useShortcutHints,
  type Shortcut,
} from "@/hooks/use-shortcuts";
import { useTour } from "@/components/tour/tour-context";
import { getSession, signOut } from "@/auth/server-fns";
import { listMyOrgs, switchOrg } from "@/auth/org-fns";
import { requestPasswordReset } from "@/auth/password-reset-fns";
import { resetAllOnboarding } from "@/lib/onboarding-flags";
import { useCurrentOrg } from "@/hooks/use-current-org";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login", search: { redirect: location.href } });
    if (location.pathname.startsWith("/onboarding")) return { session };
    if (!session.current_org_id) {
      // listMyOrgs self-heals a stale JWT by binding to the first org and
      // rebaking the cookie. If the user genuinely has no orgs, route them
      // through onboarding to create one.
      const { orgs, current_org_id } = await listMyOrgs();
      if (orgs.length === 0) throw redirect({ to: "/onboarding" });
      if (!current_org_id) throw redirect({ to: "/onboarding" });
    }
    return { session };
  },
  component: AuthLayout,
});

// Shows "crema / workspace / <org>" in the topbar so the active organization
// is always visible. Falls back to "crema / workspace" until the org resolves
// or when the user isn't in an org.
function WorkspaceHeading() {
  const { org } = useCurrentOrg();
  return (
    <div className="ml-3 min-w-0 truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      crema / workspace{org ? ` / ${org.name}` : ""}
    </div>
  );
}

function HelpTriggerButton() {
  const { setOpen, state } = useHelp();
  // When the panel is pinned, the dock is already visible — the topbar
  // trigger would just no-op (the modal Sheet is suppressed in pinned mode),
  // so hide it to avoid a dead button.
  if (state.pinned) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setOpen(true)}
      aria-label="Open help"
      className="h-7 w-7"
    >
      <HelpCircle className="size-4" />
    </Button>
  );
}

// Single-key navigation. `i` (tickets/inbox) avoids the `j`/`k` keys reserved
// for list-nav row movement.
const NAV_BINDINGS = [
  { id: "nav-funnel", keys: "f", label: "Go to The Funnel", to: "/funnel" },
  { id: "nav-traffic", keys: "r", label: "Go to Visitor Activity", to: "/traffic" },
  { id: "nav-today", keys: "t", label: "Go to Today", to: "/today" },
  { id: "nav-deals", keys: "d", label: "Go to Deals", to: "/deals" },
  { id: "nav-relationships", keys: "p", label: "Go to Relationships", to: "/relationships" },
  { id: "nav-contacts", keys: "o", label: "Go to Contacts", to: "/contacts" },
  { id: "nav-companies", keys: "c", label: "Go to Companies", to: "/companies" },
  { id: "nav-tickets", keys: "i", label: "Go to Tickets", to: "/tickets" },
  { id: "nav-settings", keys: "s", label: "Go to Settings", to: "/settings" },
  { id: "nav-extension", keys: "e", label: "Go to Browser Extension", to: "/extension" },
  { id: "nav-integrations", keys: "w", label: "Go to Tracking and Webhooks", to: "/integrations" },
  { id: "nav-developer", keys: "a", label: "Go to CLI / API", to: "/developer" },
] as const;

function PaletteAndShortcuts({ userId, email }: { userId: string; email: string }) {
  const navigate = useNavigate();
  const { setOpen: setAssistantOpen } = useAssistant();
  const { setOpen: setHelpDrawerOpen } = useHelp();
  const { startTour } = useTour();
  const { toggleSidebar } = useSidebar();
  const { visible: hintsVisible, setVisible: setHintsVisible } = useShortcutHints();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const signOutFn = useServerFn(signOut);
  const switchOrgFn = useServerFn(switchOrg);
  const requestPasswordResetFn = useServerFn(requestPasswordReset);

  // Org list — drives the "Switch organization" entries below. Shares the
  // ["my-orgs"] cache with the rest of the authed UI so opening the palette
  // is instant.
  const { orgs, orgId: currentOrgId } = useCurrentOrg();

  const globals: Shortcut[] = [
    {
      id: "global-palette",
      keys: ["mod+k"],
      label: "Open command palette",
      group: "Global",
      run: () => setPaletteOpen(true),
    },
    {
      id: "global-shortcuts-help",
      keys: ["mod+/"],
      label: "Show keyboard shortcuts",
      group: "Global",
      run: () => setHelpOpen(true),
    },
  ];

  const actions: Shortcut[] = [
    {
      id: "action-open-assistant",
      keys: ["mod+j"],
      label: "Open assistant",
      group: "Action",
      run: () => setAssistantOpen(true),
    },
  ];

  // Palette-only entries — no hotkeys. Letters are scarce (single-key nav
  // takes most) and these flows are rare enough that a binding is overkill.
  // Grouped together so the new-user / housekeeping commands are discoverable
  // in one place in the palette.
  const workspace: Shortcut[] = [
    {
      id: "workspace-jump-coach-chat",
      keys: [],
      label: "Open coach chat",
      group: "Workspace",
      run: () => {
        void navigate({ to: "/chat" });
      },
    },
    {
      id: "workspace-open-assistant-bubble",
      keys: [],
      label: "Open assistant bubble",
      group: "Workspace",
      run: () => setAssistantOpen(true),
    },
    {
      id: "workspace-start-tour",
      keys: [],
      label: "Start interface tour",
      group: "Workspace",
      run: () => startTour(),
    },
    {
      id: "workspace-replay-onboarding",
      keys: [],
      label: "Replay onboarding",
      group: "Workspace",
      run: () => {
        resetAllOnboarding(userId);
        window.location.assign("/onboarding/coach");
      },
    },
    {
      id: "workspace-change-coach",
      keys: [],
      label: "Change coach persona",
      group: "Workspace",
      run: () => {
        void navigate({ to: "/onboarding/coach" });
      },
    },
    {
      id: "workspace-invite-teammate",
      keys: [],
      label: "Invite teammate",
      group: "Workspace",
      run: () => {
        void navigate({
          to: "/settings",
          search: { tab: "organization", focus: "invite" } as never,
        });
      },
    },
    {
      id: "workspace-connect-extension",
      keys: [],
      label: "Connect this browser",
      group: "Workspace",
      run: () => {
        void navigate({ to: "/extension/onboard" });
      },
    },
    {
      id: "workspace-open-help-drawer",
      keys: [],
      label: "Open help drawer",
      group: "Workspace",
      run: () => setHelpDrawerOpen(true),
    },
    {
      id: "workspace-show-shortcuts",
      keys: [],
      label: "Show keyboard shortcuts",
      group: "Workspace",
      run: () => setHelpOpen(true),
    },
    {
      id: "workspace-toggle-hints",
      keys: [],
      label: hintsVisible ? "Hide shortcut hints" : "Show shortcut hints",
      group: "Workspace",
      run: () => setHintsVisible(!hintsVisible),
    },
    {
      id: "workspace-toggle-sidebar",
      keys: [],
      label: "Toggle sidebar",
      group: "Workspace",
      run: () => toggleSidebar(),
    },
    {
      id: "workspace-copy-url",
      keys: [],
      label: "Copy page URL",
      group: "Workspace",
      run: () => {
        const url = window.location.href;
        void navigator.clipboard
          .writeText(url)
          .then(() => toast.success("URL copied"))
          .catch(() => toast.error("Failed to copy URL"));
      },
    },
    {
      id: "workspace-reset-password",
      keys: [],
      label: "Reset my password",
      group: "Workspace",
      run: () => {
        void requestPasswordResetFn({ data: { email } }).then(() => {
          toast.success(`Password reset link sent to ${email}`);
        });
      },
    },
    {
      id: "workspace-sign-out",
      keys: [],
      label: "Sign out",
      group: "Workspace",
      run: () => {
        void signOutFn().then(() => navigate({ to: "/login" }));
      },
    },
    // Switch-org rows only appear if the user belongs to more than one org —
    // a single-org user has nothing to switch to.
    ...(orgs.length > 1
      ? orgs
          .filter((o) => o.id !== currentOrgId)
          .map<Shortcut>((o) => ({
            id: `workspace-switch-org-${o.id}`,
            keys: [],
            label: `Switch to ${o.name}`,
            group: "Workspace",
            run: () => {
              void switchOrgFn({ data: { org_id: o.id } }).then(() => {
                window.location.assign("/today");
              });
            },
          }))
      : []),
  ];

  const navShortcuts: Shortcut[] = NAV_BINDINGS.map((b) => ({
    id: b.id,
    keys: [b.keys],
    label: b.label,
    group: "Navigation" as const,
    meta: { url: b.to },
    run: () => {
      void navigate({ to: b.to });
    },
  }));

  useRegisterShortcut([...globals, ...actions, ...workspace, ...navShortcuts]);

  return (
    <>
      <button
        type="button"
        data-tour-id="palette-pill"
        onClick={() => setPaletteOpen(true)}
        className="ml-auto inline-flex items-center gap-2 h-7 px-2 rounded-md border border-border bg-muted/30 hover:bg-muted text-xs text-muted-foreground transition-colors"
        aria-label="Open command palette"
      >
        <Search className="size-3.5" />
        <span>Search</span>
        <span className="text-border">|</span>
        <KbdHint keys="mod+k" tone="accent" force />
      </button>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}

function AuthLayout() {
  const { session } = Route.useRouteContext();
  return (
    <HelpProvider>
      <PeekProvider>
      <SidebarProvider>
        <TourProvider userId={session.userId}>
          <AssistantProvider>
            <ShortcutsProvider>
              <div className="flex min-h-screen w-full bg-background">
                <AppSidebar />
                <div className="flex-1 flex flex-col min-w-0">
                  <header
                    data-tour-id="topbar"
                    className="h-12 flex items-center border-b border-border px-3 sticky top-0 bg-background/95 backdrop-blur z-10"
                  >
                    <SidebarTrigger />
                    <WorkspaceHeading />
                    <PaletteAndShortcuts userId={session.userId} email={session.email} />
                    <HelpTriggerButton />
                  </header>
                  <main className="flex-1 min-w-0">
                    <Outlet />
                  </main>
                </div>
                <HelpDockedPanel />
                <AssistantBubble />
                <HelpDrawer />
                <PeekHost />
                <TourAutoStart userId={session.userId} />
                <TourWelcomePrompt />
                <TourOverlay />
                <OnboardingConversation
                  userId={session.userId}
                  coachSlug={session.coach_persona_slug}
                />
              </div>
            </ShortcutsProvider>
          </AssistantProvider>
        </TourProvider>
      </SidebarProvider>
      </PeekProvider>
    </HelpProvider>
  );
}
