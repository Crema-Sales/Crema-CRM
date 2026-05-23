import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  listDeals,
  updateDealStage,
  updateDeal,
  getDeal,
  createDeal,
  listCompanies,
  listContacts,
} from "@/lib/crm.functions";
import { DEAL_STAGES, DEAL_STAGE_LABELS, type DealStage } from "@/lib/stages";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Plus,
  Trophy,
  X,
  Save,
  Handshake,
  Building2,
  User,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { usePeek } from "@/components/peek/peek-context";
import { useRegisterHelp } from "@/hooks/use-help";
import { dealsHelpContent } from "@/components/help/content/deals-help";

export const Route = createFileRoute("/_authenticated/deals")({ component: DealsRoute });

// /deals/$id is a child of /deals in file-based routing, so this parent must
// render <Outlet /> for it to mount. On the detail route we hand the whole
// screen to the child instead of overlaying the kanban.
function DealsRoute() {
  const matches = useRouterState({ select: (s) => s.matches });
  const isDetailRoute = matches.some((m) => m.routeId === "/_authenticated/deals/$id");
  return isDetailRoute ? <Outlet /> : <DealsPage />;
}

type Deal = {
  id: string;
  name: string;
  stage: DealStage;
  value: number;
  probability: number;
  company_id: string | null;
  contact_id: string | null;
  company?: { name: string } | null;
  contact?: { full_name: string } | null;
};

const STAGE_TINT: Record<DealStage, string> = {
  discovery: "linear-gradient(135deg, rgba(255,140,60,0.14), rgba(255,140,60,0.03))",
  qualified: "linear-gradient(135deg, rgba(250,210,60,0.14), rgba(250,210,60,0.03))",
  proposal:  "linear-gradient(135deg, rgba(140,210,80,0.14), rgba(140,210,80,0.03))",
  closing:   "linear-gradient(135deg, rgba(60,180,220,0.14), rgba(60,180,220,0.03))",
  won:       "linear-gradient(135deg, rgba(50,195,100,0.20), rgba(50,195,100,0.06))",
  lost:      "linear-gradient(135deg, rgba(150,150,150,0.10), rgba(150,150,150,0.03))",
};

const STAGE_ICON: Partial<Record<DealStage, typeof Trophy>> = {
  won: Trophy,
  lost: X,
};

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

function DealsPage() {
  useRegisterHelp(dealsHelpContent);
  const qc = useQueryClient();
  const listFn = useServerFn(listDeals);
  const updateStageFn = useServerFn(updateDealStage);
  const createFn = useServerFn(createDeal);
  const listCompaniesFn = useServerFn(listCompanies);
  const listContactsFn = useServerFn(listContacts);

  const { data: deals = [] } = useQuery({ queryKey: ["deals"], queryFn: () => listFn() });
  const { data: companies = [] } = useQuery({ queryKey: ["companies"], queryFn: () => listCompaniesFn() });
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => listContactsFn() });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);

  const updateStage = useMutation({
    mutationFn: (v: { id: string; stage: DealStage }) => updateStageFn({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["deals"] });
      const prev = qc.getQueryData<Deal[]>(["deals"]);
      qc.setQueryData<Deal[]>(["deals"], (old) =>
        (old ?? []).map((d) => (d.id === v.id ? { ...d, stage: v.stage } : d)),
      );
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["deals"], ctx.prev);
      toast.error(e?.message ?? "Failed to move deal");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["deals"] }),
  });

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const id = String(e.active.id);
    const stage = String(e.over.id) as DealStage;
    if (!DEAL_STAGES.includes(stage)) return;
    const cur = deals.find((d: Deal) => d.id === id);
    if (!cur || cur.stage === stage) return;
    updateStage.mutate({ id, stage });
  };

  // Group + totals
  const byStage = useMemo(() => {
    const out: Record<DealStage, Deal[]> = {
      discovery: [], qualified: [], proposal: [], closing: [], won: [], lost: [],
    };
    for (const d of deals as Deal[]) {
      if (DEAL_STAGES.includes(d.stage)) out[d.stage].push(d);
    }
    return out;
  }, [deals]);

  const totalOpen = useMemo(
    () => (deals as Deal[])
      .filter((d) => d.stage !== "won" && d.stage !== "lost")
      .reduce((s, d) => s + Number(d.value || 0), 0),
    [deals],
  );

  return (
    <div className="px-4 md:px-8 py-8 max-w-[1500px] mx-auto">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Pipeline
          </div>
          <h1
            className="text-4xl md:text-5xl font-medium tracking-tight"
            style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
          >
            Deals on the bench.
          </h1>
          <p className="text-muted-foreground mt-2 max-w-lg">
            Drag a card to move it down the funnel. Every stage snaps to the org's confidence percentage.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-border bg-card px-4 py-2 flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Open pipeline
            </span>
            <span className="text-xl font-semibold tabular-nums text-primary">{fmtUsd(totalOpen)}</span>
          </div>
          <NewDealDialog
            companies={companies as { id: string; name: string }[]}
            contacts={contacts as { id: string; full_name: string }[]}
            onCreate={async (input) => {
              await createFn({ data: input });
              qc.invalidateQueries({ queryKey: ["deals"] });
              toast.success(`Created "${input.name}"`);
            }}
          />
        </div>
      </header>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 min-w-0">
          {DEAL_STAGES.map((stage) => {
            const items = byStage[stage];
            const sum = items.reduce((s, d) => s + Number(d.value || 0), 0);
            return (
              <StageColumn
                key={stage}
                stage={stage}
                count={items.length}
                sum={sum}
              >
                {items.map((d) => (
                  <DealCard key={d.id} deal={d} onOpen={() => setSelectedDealId(d.id)} />
                ))}
                {items.length === 0 && (
                  <div className="text-xs text-muted-foreground italic text-center py-8 border border-dashed border-border rounded-md">
                    No deals
                  </div>
                )}
              </StageColumn>
            );
          })}
        </div>
      </DndContext>

      <DealDetailSheet
        dealId={selectedDealId}
        companies={companies as { id: string; name: string }[]}
        contacts={contacts as { id: string; full_name: string }[]}
        onClose={() => setSelectedDealId(null)}
      />
    </div>
  );
}

function StageColumn({
  stage, count, sum, children,
}: { stage: DealStage; count: number; sum: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const Icon = STAGE_ICON[stage];
  return (
    <div className="min-w-0">
      <div
        className="rounded-t-lg px-3 py-2 border border-border border-b-0"
        style={{ background: STAGE_TINT[stage] }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {Icon ? <Icon className="size-3.5" /> : null}
            <span className="text-sm font-semibold">{DEAL_STAGE_LABELS[stage]}</span>
          </div>
          <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-widest">
            {count}
          </Badge>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
          {fmtUsd(sum)}
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`rounded-b-lg border border-border border-t-0 p-2 space-y-2 min-h-[200px] transition-colors ${
          isOver ? "bg-accent/30" : "bg-card/30"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function DealCard({ deal, onOpen }: { deal: Deal; onOpen: () => void }) {
  const { peek } = usePeek();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onDoubleClick={() => {
        if (!isDragging) onOpen();
      }}
      title="Double-click to view details"
      className={`select-none ${isDragging ? "opacity-50 z-50" : ""}`}
    >
      <Card className="border-border p-2.5 hover:border-primary/40 transition-colors cursor-grab active:cursor-grabbing">
        <div className="flex items-start justify-between gap-2">
          <Link
            to="/deals/$id"
            params={{ id: deal.id }}
            className="text-sm font-medium leading-tight hover:text-primary"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {deal.name}
          </Link>
          <span className="font-mono text-[10px] tabular-nums text-primary shrink-0">
            {fmtUsd(deal.value)}
          </span>
        </div>
        {deal.company?.name && deal.company_id ? (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              peek("company", deal.company_id!);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:text-primary mt-1.5 truncate block text-left"
          >
            {deal.company.name}
          </button>
        ) : (
          <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-1.5 truncate">
            no company
          </div>
        )}
        {deal.contact?.full_name && (
          <Link
            to="/contacts/$id"
            params={{ id: deal.contact_id ?? "" }}
            className="text-[11px] text-muted-foreground hover:text-primary truncate block mt-0.5"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {deal.contact.full_name}
          </Link>
        )}
        <div className="flex items-center justify-between mt-1.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            {deal.probability}% confidence
          </span>
        </div>
      </Card>
    </div>
  );
}

function DealStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-md p-2.5">
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function DealDetailSheet({
  dealId,
  companies,
  contacts,
  onClose,
}: {
  dealId: string | null;
  companies: { id: string; name: string }[];
  contacts: { id: string; full_name: string }[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const getDealFn = useServerFn(getDeal);
  const updateFn = useServerFn(updateDeal);
  const updateStageFn = useServerFn(updateDealStage);

  const { data, isLoading } = useQuery({
    queryKey: ["deal", dealId],
    queryFn: () => getDealFn({ data: { id: dealId! } }),
    enabled: !!dealId,
  });

  const [form, setForm] = useState({
    name: "",
    value: "",
    company_id: "",
    contact_id: "",
    expected_close: "",
  });

  useEffect(() => {
    if (data?.deal) {
      const d = data.deal;
      setForm({
        name: d.name ?? "",
        value: d.value?.toString() ?? "",
        company_id: d.company_id ?? "",
        contact_id: d.contact_id ?? "",
        expected_close: d.expected_close?.slice(0, 10) ?? "",
      });
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id: dealId!,
          name: form.name,
          value: Number(form.value) || 0,
          company_id: form.company_id || null,
          contact_id: form.contact_id || null,
          expected_close: form.expected_close || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal", dealId] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const stageMut = useMutation({
    mutationFn: (stage: DealStage) => updateStageFn({ data: { id: dealId!, stage } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal", dealId] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Stage updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const deal = data?.deal;

  return (
    <Sheet open={!!dealId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="sr-only">Deal details</SheetTitle>
        </SheetHeader>

        {isLoading || !deal ? (
          <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>
        ) : (
          <div className="space-y-6 mt-1">
            <header className="flex items-start gap-3 pr-8">
              <div
                className="size-11 rounded-md flex items-center justify-center shrink-0"
                style={{ background: STAGE_TINT[deal.stage as DealStage] }}
              >
                <Handshake className="size-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <h2
                  className="text-2xl font-medium tracking-tight leading-tight"
                  style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
                >
                  {deal.name}
                </h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {DEAL_STAGE_LABELS[deal.stage as DealStage] ?? deal.stage}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-semibold tabular-nums">{fmtUsd(deal.value)}</span>
                </div>
              </div>
            </header>

            <div className="grid grid-cols-3 gap-2">
              <DealStat label="Probability" value={`${deal.probability ?? 0}%`} />
              <DealStat
                label="Close"
                value={deal.expected_close ? format(new Date(deal.expected_close), "MMM d") : "—"}
              />
              <DealStat label="Activity" value={String(data.activities.length)} />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Details</h3>
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Value</Label>
                  <Input
                    type="number"
                    min={0}
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Expected close</Label>
                  <Input
                    type="date"
                    value={form.expected_close}
                    onChange={(e) => setForm({ ...form, expected_close: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Stage</Label>
                <Select
                  value={deal.stage}
                  onValueChange={(v) => stageMut.mutate(v as DealStage)}
                  disabled={stageMut.isPending}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEAL_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>{DEAL_STAGE_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Company</Label>
                <select
                  value={form.company_id}
                  onChange={(e) => setForm({ ...form, company_id: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— none —</option>
                  {companies.map((co) => (
                    <option key={co.id} value={co.id}>{co.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Contact</Label>
                <select
                  value={form.contact_id}
                  onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">— none —</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </div>
              <Button
                size="sm"
                className="gap-2 w-full"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || !form.name.trim()}
              >
                <Save className="size-3.5" />
                {saveMut.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>

            {(deal.company || deal.contact) && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Linked records</h3>
                {deal.company && deal.company_id && (
                  <Link
                    to="/companies/$id"
                    params={{ id: deal.company_id }}
                    className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-muted/40 transition-colors"
                  >
                    <Building2 className="size-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{deal.company.name}</div>
                      {deal.company.industry && (
                        <div className="text-xs text-muted-foreground">{deal.company.industry}</div>
                      )}
                    </div>
                  </Link>
                )}
                {deal.contact && deal.contact_id && (
                  <Link
                    to="/contacts/$id"
                    params={{ id: deal.contact_id }}
                    className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-muted/40 transition-colors"
                  >
                    <User className="size-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{deal.contact.full_name}</div>
                      {deal.contact.email && (
                        <div className="text-xs text-muted-foreground">{deal.contact.email}</div>
                      )}
                    </div>
                  </Link>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Activity</h3>
                <Link
                  to="/deals/$id"
                  params={{ id: deal.id }}
                  className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                >
                  Full page <ExternalLink className="size-3" />
                </Link>
              </div>
              {data.activities.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm italic border border-dashed border-border rounded-md">
                  No activity yet.
                </div>
              ) : (
                <ul className="divide-y divide-border border border-border rounded-md">
                  {data.activities.map((a: any) => (
                    <li key={a.id} className="px-3 py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{a.subject}</div>
                        <div className="text-xs text-muted-foreground font-mono uppercase tracking-widest mt-0.5">
                          {a.type}
                        </div>
                      </div>
                      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(a.occurred_at))} ago
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function NewDealDialog({
  companies,
  contacts,
  onCreate,
}: {
  companies: { id: string; name: string }[];
  contacts: { id: string; full_name: string }[];
  onCreate: (input: {
    name: string;
    value: number;
    stage?: DealStage;
    company_id?: string | null;
    contact_id?: string | null;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [stage, setStage] = useState<DealStage>("discovery");
  const [companyId, setCompanyId] = useState<string | "">("");
  const [contactId, setContactId] = useState<string | "">("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName(""); setValue(""); setStage("discovery");
    setCompanyId(""); setContactId(""); setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4 mr-1" />
          Create Deal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Deal</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label htmlFor="deal-name">Name</Label>
            <Input id="deal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme — Enterprise expansion" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="deal-value">Value (USD)</Label>
              <Input id="deal-value" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} placeholder="50000" />
            </div>
            <div>
              <Label htmlFor="deal-stage">Stage</Label>
              <Select value={stage} onValueChange={(v) => setStage(v as DealStage)}>
                <SelectTrigger id="deal-stage"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEAL_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>{DEAL_STAGE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="deal-company">Company (optional)</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger id="deal-company"><SelectValue placeholder="— none —" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="deal-contact">Contact (optional)</Label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger id="deal-contact"><SelectValue placeholder="— none —" /></SelectTrigger>
              <SelectContent>
                {contacts.slice(0, 100).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (!name.trim() || !value) {
                toast.error("Name and value are required");
                return;
              }
              setSubmitting(true);
              try {
                await onCreate({
                  name: name.trim(),
                  value: Number(value),
                  stage,
                  company_id: companyId || null,
                  contact_id: contactId || null,
                });
                setOpen(false);
                reset();
              } catch (e: any) {
                toast.error(e?.message ?? "Failed to create deal");
                setSubmitting(false);
              }
            }}
            disabled={submitting}
          >
            {submitting ? "Creating…" : "Create Deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
