import { createFileRoute, useNavigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listContacts, upsertContact, listCompanies, createCompany } from "@/lib/crm.functions";
import { useState, useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UserRound, Search, Plus, Star, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useListNav } from "@/hooks/use-list-nav";
import { useRegisterShortcut } from "@/hooks/use-shortcuts";
import { KbdHint } from "@/components/kbd-hint";
import { usePeek } from "@/components/peek/peek-context";
import { useRegisterHelp } from "@/hooks/use-help";
import { contactsHelpContent } from "@/components/help/content/contacts-help";

export const Route = createFileRoute("/_authenticated/contacts")({ component: ContactsRoute });

// /contacts/$id is a child of /contacts in file-based routing, so this parent
// must render <Outlet /> for it to mount. On the detail route we hand the
// whole screen to the child instead of overlaying the list.
function ContactsRoute() {
  const matches = useRouterState({ select: (s) => s.matches });
  const isDetailRoute = matches.some((m) => m.routeId === "/_authenticated/contacts/$id");
  return isDetailRoute ? <Outlet /> : <ContactsPage />;
}

const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  contact: "Contact",
  deal: "Deal",
  customer: "Customer",
};

const STAGE_COLORS: Record<string, string> = {
  lead: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  contact: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  deal: "bg-[#c9885a]/10 text-[#c9885a] border-[#c9885a]/30",
  customer: "bg-green-500/10 text-green-400 border-green-500/20",
};

function ContactsPage() {
  useRegisterHelp(contactsHelpContent);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listContacts);
  const upsertFn = useServerFn(upsertContact);
  const listCompaniesFn = useServerFn(listCompanies);
  const createCompanyFn = useServerFn(createCompany);

  const { data = [], isLoading } = useQuery({ queryKey: ["contacts"], queryFn: () => listFn() });
  const { data: companies = [] } = useQuery({ queryKey: ["companies"], queryFn: () => listCompaniesFn() });

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    title: "",
    company_id: "",
  });
  const [newCompanyMode, setNewCompanyMode] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const filterInputRef = useRef<HTMLInputElement>(null);
  const { peek } = usePeek();

  const createMut = useMutation({
    mutationFn: async () => {
      let companyId: string | null = form.company_id || null;
      if (newCompanyMode && newCompanyName.trim()) {
        const res = await createCompanyFn({ data: { name: newCompanyName.trim() } });
        companyId = res.id;
        qc.invalidateQueries({ queryKey: ["companies"] });
      }
      return upsertFn({
        data: {
          full_name: form.full_name,
          email: form.email || undefined,
          phone: form.phone || undefined,
          title: form.title || undefined,
          company_id: companyId,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setForm({ full_name: "", email: "", phone: "", title: "", company_id: "" });
      setNewCompanyMode(false);
      setNewCompanyName("");
      setOpen(false);
      toast.success("Contact added");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const filtered = useMemo(
    () =>
      (data as any[]).filter((c) => {
        if (!q) return true;
        const needle = q.toLowerCase();
        return (
          c.full_name.toLowerCase().includes(needle) ||
          (c.email ?? "").toLowerCase().includes(needle) ||
          (c.title ?? "").toLowerCase().includes(needle) ||
          (c.company?.name ?? "").toLowerCase().includes(needle)
        );
      }),
    [data, q],
  );

  const totals = useMemo(() => {
    const all = data as any[];
    return {
      total: all.length,
      icp: all.filter((c) => c.is_ideal_customer).length,
      customers: all.filter((c) => c.relationship_stage === "customer").length,
      deals: all.filter((c) => c.relationship_stage === "deal").length,
    };
  }, [data]);

  const { bind } = useListNav<{ id: string }>({
    items: filtered.map((c: any) => ({ id: c.id })),
    scope: "contacts",
    onOpen: (item) => navigate({ to: "/contacts/$id", params: { id: item.id } }),
  });

  useRegisterShortcut([
    {
      id: "list-contacts-focus-filter",
      keys: ["/"],
      label: "Focus filter",
      group: "List",
      run: () => filterInputRef.current?.focus(),
    },
    {
      id: "list-contacts-new",
      keys: ["n"],
      label: "New contact",
      group: "Action",
      run: () => setOpen(true),
    },
  ]);

  return (
    <div className="px-4 md:px-8 py-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Contacts
          </div>
          <h1
            className="text-4xl font-semibold tracking-tight"
            style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
          >
            Every person in the cup.
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="size-4" /> New contact
                <KbdHint keys="n" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New contact</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div>
                  <Label>Full name *</Label>
                  <Input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    placeholder="Jane Smith"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="jane@acme.com"
                    />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="+1 555 000 0000"
                    />
                  </div>
                </div>
                <div>
                  <Label>Title</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Head of Coffee"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Company</Label>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !newCompanyMode;
                        setNewCompanyMode(next);
                        if (next) {
                          setForm({ ...form, company_id: "" });
                        } else {
                          setNewCompanyName("");
                        }
                      }}
                      className="text-xs text-muted-foreground hover:text-primary"
                    >
                      {newCompanyMode ? "Pick existing" : "+ New company"}
                    </button>
                  </div>
                  {newCompanyMode ? (
                    <Input
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      placeholder="Acme Inc."
                      autoFocus
                    />
                  ) : (
                    <select
                      value={form.company_id}
                      onChange={(e) => setForm({ ...form, company_id: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">— none —</option>
                      {(companies as any[]).map((co: any) => (
                        <option key={co.id} value={co.id}>{co.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createMut.mutate()}
                  disabled={
                    !form.full_name.trim() ||
                    (newCompanyMode && !newCompanyName.trim()) ||
                    createMut.isPending
                  }
                >
                  {createMut.isPending ? "Saving…" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Contacts" value={totals.total} />
        <Stat label="ICPs" value={totals.icp} />
        <Stat label="In deal" value={totals.deals} />
        <Stat label="Customers" value={totals.customers} />
      </div>

      <div className="relative max-w-md">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={filterInputRef}
          className="pl-9"
          placeholder="Search name, email, title, company…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="text-[10px] text-muted-foreground flex items-center gap-3">
        <span className="inline-flex items-center gap-1">
          <KbdHint keys="j" /> next
        </span>
        <span className="inline-flex items-center gap-1">
          <KbdHint keys="k" /> prev
        </span>
        <span className="inline-flex items-center gap-1">
          <KbdHint keys="enter" /> open
        </span>
        <span className="inline-flex items-center gap-1">
          <KbdHint keys="/" /> filter
        </span>
        <span className="inline-flex items-center gap-1">
          <KbdHint keys="n" /> new
        </span>
      </div>

      <Card className="border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <Th>Contact</Th>
              <Th>Company</Th>
              <Th>Stage</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th className="text-center">ICP</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c: any) => (
              <tr
                key={c.id}
                {...bind({ id: c.id })}
                onClick={() => navigate({ to: "/contacts/$id", params: { id: c.id } })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate({ to: "/contacts/$id", params: { id: c.id } });
                  }
                }}
                tabIndex={0}
                role="button"
                className="border-t border-border hover:bg-muted/30 data-[active=true]:bg-muted/60 cursor-pointer"
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate({ to: "/contacts/$id", params: { id: c.id } });
                    }}
                    className="flex items-center gap-2 font-medium hover:text-primary text-left"
                  >
                    <UserRound className="size-4 text-muted-foreground shrink-0" />
                    <span>{c.full_name}</span>
                  </button>
                  {c.title && (
                    <div className="text-xs text-muted-foreground ml-6">{c.title}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.company && c.company_id ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        peek("company", c.company_id);
                      }}
                      className="inline-flex items-center gap-1.5 hover:text-primary text-left"
                    >
                      <Building2 className="size-3.5 shrink-0" />
                      {c.company.name}
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${STAGE_COLORS[c.relationship_stage] ?? "bg-muted text-muted-foreground border-border"}`}
                  >
                    {STAGE_LABELS[c.relationship_stage] ?? c.relationship_stage}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{c.email ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{c.phone ?? "—"}</td>
                <td className="px-4 py-3 text-center">
                  {c.is_ideal_customer && (
                    <Star className="size-3.5 text-[#c9885a] fill-[#c9885a] inline-block" />
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-muted-foreground text-sm italic"
                >
                  {q ? "No contacts match." : "No contacts yet — add your first."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground ${className}`}
    >
      {children}
    </th>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="border-border p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
    </Card>
  );
}
