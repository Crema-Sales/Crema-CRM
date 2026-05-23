import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDeal, updateDeal, updateDealStage, listCompanies, listContacts } from "@/lib/crm.functions";
import { DEAL_STAGES, DEAL_STAGE_LABELS, type DealStage } from "@/lib/stages";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save, Handshake, Building2, User } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { useRegisterHelp } from "@/hooks/use-help";
import { dealDetailHelpContent } from "@/components/help/content/deal-detail-help";

export const Route = createFileRoute("/_authenticated/deals/$id")({ component: DealDetailPage });

const STAGE_TINT: Record<DealStage, string> = {
  discovery: "rgba(255,140,60,0.14)",
  qualified:  "rgba(250,210,60,0.14)",
  proposal:   "rgba(140,210,80,0.14)",
  closing:    "rgba(60,180,220,0.14)",
  won:        "rgba(50,195,100,0.20)",
  lost:       "rgba(150,150,150,0.10)",
};

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n) || 0);
}

function DealDetailPage() {
  useRegisterHelp(dealDetailHelpContent);
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getDealFn = useServerFn(getDeal);
  const updateFn = useServerFn(updateDeal);
  const updateStageFn = useServerFn(updateDealStage);
  const listCompaniesFn = useServerFn(listCompanies);
  const listContactsFn = useServerFn(listContacts);

  const { data, isLoading } = useQuery({
    queryKey: ["deal", id],
    queryFn: () => getDealFn({ data: { id } }),
  });
  const { data: companies = [] } = useQuery({ queryKey: ["companies"], queryFn: () => listCompaniesFn() });
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => listContactsFn() });

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
          id,
          name: form.name,
          value: Number(form.value) || 0,
          company_id: form.company_id || null,
          contact_id: form.contact_id || null,
          expected_close: form.expected_close || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal", id] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const stageMut = useMutation({
    mutationFn: (stage: DealStage) => updateStageFn({ data: { id, stage } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal", id] });
      qc.invalidateQueries({ queryKey: ["deals"] });
      toast.success("Stage updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  if (!data?.deal) return (
    <div className="p-8 text-muted-foreground text-sm">
      Deal not found. <Link to="/deals" className="underline">Back to deals</Link>
    </div>
  );

  const deal = data.deal;

  return (
    <div className="px-4 md:px-8 py-8 max-w-[1400px] mx-auto space-y-6">
      <Link
        to="/deals"
        className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> All deals
      </Link>

      <header className="flex items-start gap-4">
        <div
          className="size-12 rounded-md flex items-center justify-center shrink-0"
          style={{ background: STAGE_TINT[deal.stage as DealStage] ?? "rgba(150,150,150,0.10)" }}
        >
          <Handshake className="size-6 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h1
            className="text-3xl font-medium tracking-tight truncate"
            style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
          >
            {deal.name}
          </h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {DEAL_STAGE_LABELS[deal.stage as DealStage] ?? deal.stage}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="font-semibold tabular-nums">{fmtUsd(deal.value)}</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Value" value={fmtUsd(deal.value)} />
        <Stat label="Probability" value={`${deal.probability ?? 0}%`} />
        <Stat label="Expected close" value={deal.expected_close ? format(new Date(deal.expected_close), "MMM d, yyyy") : "—"} />
        <Stat label="Activities" value={String(data.activities.length)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-border p-5 space-y-4 lg:col-span-1">
          <h2 className="text-sm font-semibold">Details</h2>

          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

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
            <Label>Stage</Label>
            <Select
              value={deal.stage}
              onValueChange={(v) => stageMut.mutate(v as DealStage)}
              disabled={stageMut.isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEAL_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>{DEAL_STAGE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Expected close</Label>
            <Input
              type="date"
              value={form.expected_close}
              onChange={(e) => setForm({ ...form, expected_close: e.target.value })}
            />
          </div>

          <div>
            <Label>Company</Label>
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
          </div>

          <div>
            <Label>Contact</Label>
            <select
              value={form.contact_id}
              onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">— none —</option>
              {(contacts as any[]).map((c: any) => (
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
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {(deal.company || deal.contact) && (
            <Card className="border-border p-5 space-y-3">
              <h2 className="text-sm font-semibold">Linked records</h2>
              {deal.company && (
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
              {deal.contact && (
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
            </Card>
          )}

          <Card className="border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Activity
            </div>
            {data.activities.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm italic">No activity yet.</div>
            ) : (
              <ul className="divide-y divide-border">
                {data.activities.map((a: any) => (
                  <li key={a.id} className="px-4 py-3 flex items-start justify-between gap-3">
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
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
    </Card>
  );
}
