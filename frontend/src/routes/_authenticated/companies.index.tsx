import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCompanies, createCompany } from "@/lib/crm.functions";
import { useState, useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Building2, Search, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useRegisterHelp } from "@/hooks/use-help";
import { companiesHelpContent } from "@/components/help/content/companies-help";
import { useListNav } from "@/hooks/use-list-nav";
import { useRegisterShortcut } from "@/hooks/use-shortcuts";
import { KbdHint } from "@/components/kbd-hint";

export const Route = createFileRoute("/_authenticated/companies/")({ component: CompaniesPage });

function CompaniesPage() {
  useRegisterHelp(companiesHelpContent);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listCompanies);
  const createFn = useServerFn(createCompany);
  const { data = [], isLoading } = useQuery({ queryKey: ["companies"], queryFn: () => listFn() });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    domain: "",
    industry: "",
    location: "",
    employee_count: "",
    notes: "",
  });
  const filterInputRef = useRef<HTMLInputElement>(null);

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          name: form.name,
          domain: form.domain || undefined,
          industry: form.industry || undefined,
          location: form.location || undefined,
          employee_count: form.employee_count ? Number(form.employee_count) : undefined,
          notes: form.notes || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      setForm({ name: "", domain: "", industry: "", location: "", employee_count: "", notes: "" });
      setOpen(false);
      toast.success("Company added");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const filtered = useMemo(
    () =>
      (data as any[]).filter((c) => {
        if (!q) return true;
        const needle = q.toLowerCase();
        return (
          c.name.toLowerCase().includes(needle) ||
          (c.domain ?? "").toLowerCase().includes(needle) ||
          (c.industry ?? "").toLowerCase().includes(needle) ||
          (c.location ?? "").toLowerCase().includes(needle)
        );
      }),
    [data, q],
  );

  const totals = useMemo(
    () => ({
      companies: data.length,
      contacts: (data as any[]).reduce((s, c) => s + (c.contact_count ?? 0), 0),
      deals: (data as any[]).reduce((s, c) => s + (c.deal_count ?? 0), 0),
      openValue: (data as any[]).reduce((s, c) => s + (c.open_value ?? 0), 0),
    }),
    [data],
  );

  const { bind } = useListNav<{ id: string }>({
    items: filtered.map((c: any) => ({ id: c.id })),
    scope: "companies",
    onOpen: (item) => navigate({ to: "/companies/$id", params: { id: item.id } }),
  });

  useRegisterShortcut([
    {
      id: "list-companies-focus-filter",
      keys: ["/"],
      label: "Focus filter",
      group: "List",
      run: () => {
        filterInputRef.current?.focus();
      },
    },
    {
      id: "list-companies-new",
      keys: ["n"],
      label: "New company",
      group: "Action",
      run: () => setOpen(true),
    },
  ]);

  return (
    <div className="px-4 md:px-8 py-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Companies
          </div>
          <h1
            className="text-4xl font-medium tracking-tight"
            style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
          >
            The houses we pour for.
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="size-4" /> New company
                <KbdHint keys="n" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New company</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div>
                  <Label>Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Acme Inc."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Domain</Label>
                    <Input
                      value={form.domain}
                      onChange={(e) => setForm({ ...form, domain: e.target.value })}
                      placeholder="acme.com"
                    />
                  </div>
                  <div>
                    <Label>Industry</Label>
                    <Input
                      value={form.industry}
                      onChange={(e) => setForm({ ...form, industry: e.target.value })}
                      placeholder="SaaS"
                    />
                  </div>
                </div>
                <div>
                  <Label>Location</Label>
                  <Input
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Portland, OR"
                  />
                </div>
                <div>
                  <Label>Employees</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.employee_count}
                    onChange={(e) => setForm({ ...form, employee_count: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createMut.mutate()}
                  disabled={!form.name.trim() || createMut.isPending}
                >
                  {createMut.isPending ? "Saving…" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Companies" value={totals.companies} />
        <Stat label="Contacts" value={totals.contacts} />
        <Stat label="Deals" value={totals.deals} />
        <Stat label="Open pipeline" value={`$${totals.openValue.toLocaleString()}`} />
      </div>

      <div className="relative max-w-md">
        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={filterInputRef}
          className="pl-9"
          placeholder="Search name, domain, industry, location…"
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
              <Th>Company</Th>
              <Th>Industry</Th>
              <Th>Location</Th>
              <Th className="text-right">Employees</Th>
              <Th className="text-right">Contacts</Th>
              <Th className="text-right">Deals</Th>
              <Th className="text-right">Open value</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c: any) => (
              <tr
                key={c.id}
                {...bind({ id: c.id })}
                onClick={() => navigate({ to: "/companies/$id", params: { id: c.id } })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate({ to: "/companies/$id", params: { id: c.id } });
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
                      navigate({ to: "/companies/$id", params: { id: c.id } });
                    }}
                    className="flex items-center gap-2 font-medium hover:text-primary text-left"
                  >
                    <Building2 className="size-4 text-muted-foreground" />
                    <span>{c.name}</span>
                  </button>
                  {c.domain && <div className="text-xs text-muted-foreground ml-6">{c.domain}</div>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{c.industry ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.location ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {c.employee_count ?? "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{c.contact_count}</td>
                <td className="px-4 py-3 text-right tabular-nums">{c.deal_count}</td>
                <td className="px-4 py-3 text-right tabular-nums font-mono text-xs">
                  ${Number(c.open_value).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to="/companies/$id"
                    params={{ id: c.id }}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="size-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-muted-foreground text-sm italic"
                >
                  {q ? "No companies match." : "No companies yet — add your first."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Th({ children, className = "" }: { children?: any; className?: string }) {
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
