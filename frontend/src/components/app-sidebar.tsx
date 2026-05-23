import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Coffee,
  Sun,
  Users,
  UserRound,
  Building2,
  LifeBuoy,
  LogOut,
  Settings,
  TrendingUp,
  Briefcase,
  Puzzle,
  Webhook,
  Terminal,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { KbdHint } from "@/components/kbd-hint";
import { signOut } from "@/auth/server-fns";

// Core CRM workspace — the day-to-day surfaces.
const workspaceItems = [
  { title: "Today", url: "/today", icon: Sun, tourId: "nav-today", shortcut: "t" },
  {
    title: "Relationships",
    url: "/relationships",
    icon: Users,
    tourId: "nav-relationships",
    shortcut: "p",
  },
  { title: "The Funnel", url: "/funnel", icon: Coffee, tourId: "nav-funnel", shortcut: "f" },
  {
    title: "Contacts",
    url: "/contacts",
    icon: UserRound,
    tourId: "nav-contacts",
    shortcut: "o",
  },
  {
    title: "Companies",
    url: "/companies",
    icon: Building2,
    tourId: "nav-companies",
    shortcut: "c",
  },
  { title: "Deals", url: "/deals", icon: Briefcase, tourId: "nav-deals", shortcut: "d" },
  { title: "Tickets", url: "/tickets", icon: LifeBuoy, tourId: "nav-tickets", shortcut: "i" },
  { title: "Settings", url: "/settings", icon: Settings, tourId: "nav-settings", shortcut: "s" },
];

// Below-the-line group: integrations, instrumentation, and developer surfaces.
const systemItems = [
  {
    title: "Browser Extension",
    url: "/extension",
    icon: Puzzle,
    tourId: "nav-extension",
    shortcut: "e",
  },
  {
    title: "Visitor Activity",
    url: "/traffic",
    icon: TrendingUp,
    tourId: "nav-traffic",
    shortcut: "r",
  },
  {
    title: "Tracking and Webhooks",
    url: "/integrations",
    icon: Webhook,
    tourId: "nav-integrations",
    shortcut: "w",
  },
  { title: "CLI / API", url: "/developer", icon: Terminal, tourId: "nav-developer", shortcut: "a" },
];

type NavItemData = (typeof workspaceItems)[number] | (typeof systemItems)[number];

function NavItem({
  item,
  pathname,
  collapsed,
}: {
  item: NavItemData;
  pathname: string;
  collapsed: boolean;
}) {
  const active = pathname === item.url || pathname.startsWith(item.url + "/");
  return (
    <SidebarMenuItem data-tour-id={item.tourId}>
      <SidebarMenuButton asChild isActive={active}>
        <Link to={item.url} className="flex items-center gap-2">
          <item.icon className="size-4" />
          {!collapsed && (
            <>
              <span>{item.title}</span>
              <KbdHint keys={item.shortcut} className="ml-auto" />
            </>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const signOutFn = useServerFn(signOut);

  const handleSignOut = async () => {
    await signOutFn();
    navigate({ to: "/login" });
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border" data-tour-id="sidebar">
      <SidebarHeader className="border-b border-border">
        <Link
          to="/"
          aria-label="Crema — back to home"
          className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-muted/50 transition-colors"
        >
          <Coffee className="size-5 shrink-0" style={{ color: "#c9885a" }} />
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-2xl font-bold tracking-tight">
                Crema<span style={{ color: "#c9885a" }}>.</span>
              </span>
              <span className="text-[10px] font-mono text-muted-foreground uppercase">
                CRM v1.0
              </span>
            </div>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-widest">
            Workspace
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceItems.map((item) => (
                <NavItem key={item.url} item={item} pathname={pathname} collapsed={collapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Horizontal divider — integrations / instrumentation / dev tools. */}
        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemItems.map((item) => (
                <NavItem key={item.url} item={item} pathname={pathname} collapsed={collapsed} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut}>
              <LogOut className="size-4" />
              {!collapsed && <span>Sign out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
