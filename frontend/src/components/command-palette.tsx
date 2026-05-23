import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Coffee,
  Sun,
  Users,
  Building2,
  LifeBuoy,
  Settings,
  TrendingUp,
  ArrowRight,
  Hash,
  Clock,
  MessageSquare,
  Sparkles,
  Compass,
  RotateCcw,
  UserPlus,
  HelpCircle,
  Keyboard,
  Eye,
  PanelLeft,
  Link2,
  KeyRound,
  LogOut,
  Building,
  Puzzle,
  Webhook,
  Terminal,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { KbdHint } from "@/components/kbd-hint";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { listContacts, listCompanies, listTickets, listDeals } from "@/lib/crm.functions";
import { loadRecents, pushRecent, type RecentKind } from "@/lib/palette-recents";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const NAV_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "/funnel": Coffee,
  "/traffic": TrendingUp,
  "/today": Sun,
  "/relationships": Users,
  "/companies": Building2,
  "/tickets": LifeBuoy,
  "/settings": Settings,
  "/extension": Puzzle,
  "/integrations": Webhook,
  "/developer": Terminal,
};

// Icon lookup for the Workspace group, keyed by shortcut id. Anything not in
// here falls back to Hash — keeps the palette robust if a new workspace
// shortcut is added without remembering to wire an icon.
const WORKSPACE_ICON: Record<string, ComponentType<{ className?: string }>> = {
  "workspace-jump-coach-chat": MessageSquare,
  "workspace-open-assistant-bubble": Sparkles,
  "workspace-start-tour": Compass,
  "workspace-replay-onboarding": RotateCcw,
  "workspace-change-coach": Coffee,
  "workspace-invite-teammate": UserPlus,
  "workspace-connect-extension": Puzzle,
  "workspace-open-help-drawer": HelpCircle,
  "workspace-show-shortcuts": Keyboard,
  "workspace-toggle-hints": Eye,
  "workspace-toggle-sidebar": PanelLeft,
  "workspace-copy-url": Link2,
  "workspace-reset-password": KeyRound,
  "workspace-sign-out": LogOut,
};

const RECENT_ICON: Record<RecentKind, ComponentType<{ className?: string }>> = {
  contact: Users,
  company: Building2,
  ticket: LifeBuoy,
  deal: Coffee,
};

function recentRoute(r: { kind: RecentKind; id: string }) {
  switch (r.kind) {
    case "contact":
      return { to: "/contacts/$id" as const, params: { id: r.id } };
    case "company":
      return { to: "/companies/$id" as const, params: { id: r.id } };
    case "ticket":
      return { to: "/tickets" as const, search: { id: r.id } as never };
    case "deal":
      return { to: "/funnel" as const, search: { dealId: r.id } as never };
  }
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const shortcuts = useShortcuts();
  const [search, setSearch] = useState("");
  const [recents, setRecents] = useState(() => loadRecents());

  const listContactsFn = useServerFn(listContacts);
  const listCompaniesFn = useServerFn(listCompanies);
  const listTicketsFn = useServerFn(listTickets);
  const listDealsFn = useServerFn(listDeals);

  const contactsQ = useQuery({
    queryKey: ["palette", "contacts"],
    queryFn: () => listContactsFn(),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const companiesQ = useQuery({
    queryKey: ["palette", "companies"],
    queryFn: () => listCompaniesFn(),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const ticketsQ = useQuery({
    queryKey: ["palette", "tickets"],
    queryFn: () => listTicketsFn(),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const dealsQ = useQuery({
    queryKey: ["palette", "deals"],
    queryFn: () => listDealsFn(),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  // Reset search when dialog closes so reopen feels fresh.
  useEffect(() => {
    if (!open) setSearch("");
    else setRecents(loadRecents());
  }, [open]);

  function close() {
    onOpenChange(false);
  }

  function recordAndGo(kind: RecentKind, id: string, label: string) {
    pushRecent({ kind, id, label });
    setRecents(loadRecents());
  }

  const navShortcuts = useMemo(
    () => shortcuts.filter((s) => s.group === "Navigation"),
    [shortcuts],
  );
  const actionShortcuts = useMemo(() => shortcuts.filter((s) => s.group === "Action"), [shortcuts]);
  const workspaceShortcuts = useMemo(
    () => shortcuts.filter((s) => s.group === "Workspace"),
    [shortcuts],
  );
  const listShortcuts = useMemo(() => shortcuts.filter((s) => s.group === "List"), [shortcuts]);
  const globalShortcuts = useMemo(
    () => shortcuts.filter((s) => s.group === "Global" && s.id !== "global-palette"),
    [shortcuts],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search contacts, companies, tickets, deals… or jump anywhere"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          No matches. Try a different search, or press <KbdHint keys="mod+/" force /> for all
          shortcuts.
        </CommandEmpty>

        {search.length === 0 && recents.length > 0 && (
          <CommandGroup heading="Recent">
            {recents.map((r) => {
              const Icon = RECENT_ICON[r.kind];
              return (
                <CommandItem
                  key={`${r.kind}-${r.id}`}
                  value={`recent ${r.label.toLowerCase()}`}
                  onSelect={() => {
                    close();
                    navigate(recentRoute(r));
                  }}
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="truncate">{r.label}</span>
                  <Clock className="ml-auto size-3.5 text-muted-foreground/60" />
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {navShortcuts.length > 0 && (
          <CommandGroup heading="Navigation">
            {navShortcuts.map((s) => {
              const url = typeof s.meta?.url === "string" ? s.meta.url : "";
              const Icon = NAV_ICONS[url] ?? ArrowRight;
              return (
                <CommandItem
                  key={s.id}
                  value={`nav ${s.label.toLowerCase()} ${url}`}
                  onSelect={() => {
                    close();
                    s.run();
                  }}
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <span>{s.label}</span>
                  <CommandShortcut>
                    <KbdHint keys={s.keys[0]} force />
                  </CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {actionShortcuts.length > 0 && (
          <CommandGroup heading="Actions">
            {actionShortcuts.map((s) => (
              <CommandItem
                key={s.id}
                value={`action ${s.label.toLowerCase()}`}
                onSelect={() => {
                  close();
                  s.run();
                }}
              >
                <Hash className="size-4 text-muted-foreground" />
                <span>{s.label}</span>
                {s.keys[0] && (
                  <CommandShortcut>
                    <KbdHint keys={s.keys[0]} force />
                  </CommandShortcut>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {workspaceShortcuts.length > 0 && (
          <CommandGroup heading="Workspace">
            {workspaceShortcuts.map((s) => {
              const Icon = WORKSPACE_ICON[s.id] ?? (s.id.startsWith("workspace-switch-org-") ? Building : Hash);
              return (
                <CommandItem
                  key={s.id}
                  value={`workspace ${s.label.toLowerCase()}`}
                  onSelect={() => {
                    close();
                    s.run();
                  }}
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <span>{s.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {listShortcuts.length > 0 && (
          <CommandGroup heading="On this page">
            {listShortcuts.map((s) => (
              <CommandItem
                key={s.id}
                value={`page ${s.label.toLowerCase()}`}
                onSelect={() => {
                  close();
                  s.run();
                }}
              >
                <Hash className="size-4 text-muted-foreground" />
                <span>{s.label}</span>
                <CommandShortcut>
                  <KbdHint keys={s.keys[0]} force />
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {globalShortcuts.length > 0 && (
          <CommandGroup heading="Global">
            {globalShortcuts.map((s) => (
              <CommandItem
                key={s.id}
                value={`global ${s.label.toLowerCase()}`}
                onSelect={() => {
                  close();
                  s.run();
                }}
              >
                <Hash className="size-4 text-muted-foreground" />
                <span>{s.label}</span>
                <CommandShortcut>
                  <KbdHint keys={s.keys[0]} force />
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {contactsQ.data && contactsQ.data.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Contacts">
              {contactsQ.data
                .slice(0, 8)
                .map(
                  (c: {
                    id: string;
                    full_name?: string;
                    email?: string;
                    company?: { name?: string } | null;
                  }) => {
                    const label = c.full_name || c.email || c.id;
                    const value =
                      `${label} ${c.email ?? ""} ${c.company?.name ?? ""}`.toLowerCase();
                    return (
                      <CommandItem
                        key={c.id}
                        value={value}
                        onSelect={() => {
                          close();
                          recordAndGo("contact", c.id, label);
                          navigate({ to: "/contacts/$id", params: { id: c.id } });
                        }}
                      >
                        <Users className="size-4 text-muted-foreground" />
                        <span>{label}</span>
                        {c.company?.name && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            {c.company.name}
                          </span>
                        )}
                      </CommandItem>
                    );
                  },
                )}
            </CommandGroup>
          </>
        )}

        {companiesQ.data && companiesQ.data.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Companies">
              {companiesQ.data
                .slice(0, 8)
                .map((co: { id: string; name?: string; domain?: string; industry?: string; location?: string }) => {
                  const label = co.name || co.id;
                  const value = `${label} ${co.domain ?? ""} ${co.industry ?? ""} ${co.location ?? ""}`.toLowerCase();
                  return (
                    <CommandItem
                      key={co.id}
                      value={value}
                      onSelect={() => {
                        close();
                        recordAndGo("company", co.id, label);
                        navigate({ to: "/companies/$id", params: { id: co.id } });
                      }}
                    >
                      <Building2 className="size-4 text-muted-foreground" />
                      <span>{label}</span>
                      {co.industry && (
                        <span className="ml-auto text-xs text-muted-foreground">{co.industry}</span>
                      )}
                    </CommandItem>
                  );
                })}
            </CommandGroup>
          </>
        )}

        {ticketsQ.data && ticketsQ.data.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tickets">
              {ticketsQ.data
                .slice(0, 8)
                .map(
                  (t: {
                    id: string;
                    subject?: string;
                    contact?: { full_name?: string } | null;
                  }) => {
                    const label = t.subject || `Ticket ${t.id.slice(0, 6)}`;
                    const value = `${label} ${t.contact?.full_name ?? ""}`.toLowerCase();
                    return (
                      <CommandItem
                        key={t.id}
                        value={value}
                        onSelect={() => {
                          close();
                          recordAndGo("ticket", t.id, label);
                          navigate({ to: "/tickets", search: { id: t.id } as never });
                        }}
                      >
                        <LifeBuoy className="size-4 text-muted-foreground" />
                        <span className="truncate">{label}</span>
                        {t.contact?.full_name && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            {t.contact.full_name}
                          </span>
                        )}
                      </CommandItem>
                    );
                  },
                )}
            </CommandGroup>
          </>
        )}

        {dealsQ.data && dealsQ.data.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Deals">
              {dealsQ.data
                .slice(0, 8)
                .map(
                  (d: {
                    id: string;
                    name?: string;
                    value?: number;
                    stage?: string;
                    company?: { name?: string } | null;
                  }) => {
                    const label = d.name || `Deal ${d.id.slice(0, 6)}`;
                    const value =
                      `${label} ${d.company?.name ?? ""} ${d.stage ?? ""}`.toLowerCase();
                    return (
                      <CommandItem
                        key={d.id}
                        value={value}
                        onSelect={() => {
                          close();
                          recordAndGo("deal", d.id, label);
                          navigate({ to: "/funnel", search: { dealId: d.id } as never });
                        }}
                      >
                        <Coffee className="size-4 text-muted-foreground" />
                        <span className="truncate">{label}</span>
                        {d.company?.name && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            {d.company.name}
                          </span>
                        )}
                      </CommandItem>
                    );
                  },
                )}
            </CommandGroup>
          </>
        )}
      </CommandList>

      <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <KbdHint keys="arrowup" force />
          <KbdHint keys="arrowdown" force />
          navigate
        </span>
        <span className="inline-flex items-center gap-1">
          <KbdHint keys="enter" force />
          select
        </span>
        <span className="inline-flex items-center gap-1">
          <KbdHint keys="escape" force />
          close
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <KbdHint keys="mod+/" force />
          all shortcuts
        </span>
      </div>
    </CommandDialog>
  );
}
