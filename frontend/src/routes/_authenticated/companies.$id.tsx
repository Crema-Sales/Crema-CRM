import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { enrichCompanyNow, getCompany, getMe, updateCompany } from "@/lib/crm.functions";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Building2, ArrowLeft, Save, Sparkles, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useRegisterHelp } from "@/hooks/use-help";
import { companyDetailHelpContent } from "@/components/help/content/company-detail-help";
import { SalesReportCard } from "@/components/sales-report-card";
import { resolveMethodology } from "@/lib/sales-methodology";
import { usePeek } from "@/components/peek/peek-context";

export const Route = createFileRoute("/_authenticated/companies/$id")({ component: CompanyDetailPage });

function CompanyDetailPage() {
  useRegisterHelp(companyDetailHelpContent);
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { peek } = usePeek();
  const getFn = useServerFn(getCompany);
  const updateFn = useServerFn(updateCompany);
  const meFn = useServerFn(getMe);
  const { data, isLoading } = useQuery({ queryKey: ["company", id], queryFn: () => getFn({ data: { id } }) });
  const meQ = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const { org: currentOrg } = useCurrentOrg();

  // user pref wins; otherwise the current org's pref; otherwise "none".
  const methodology = useMemo(() => {
    const userPref = (meQ.data?.profile as { sales_methodology?: string | null } | null | undefined)
      ?.sales_methodology;
    const orgPref = (currentOrg as { sales_methodology?: string | null } | null | undefined)?.sales_methodology;
    return resolveMethodology(userPref, orgPref);
  }, [meQ.data, currentOrg]);

  const [form, setForm] = useState({ name: "", domain: "", industry: "", location: "", employee_count: "", notes: "" });
  useEffect(() => {
    if (data?.company) {
      setForm({
        name: data.company.name ?? "",
        domain: data.company.domain ?? "",
        industry: data.company.industry ?? "",
        location: data.company.location ?? "",
        employee_count: data.company.employee_count?.toString() ?? "",
        notes: data.company.notes ?? "",
      });
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => updateFn({ data: {
      id,
      name: form.name,
      domain: form.domain || null,
      industry: form.industry || null,
      location: form.location || null,
      employee_count: form.employee_count ? Number(form.employee_count) : null,
      notes: form.notes || null,
    }}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company", id] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const enrichFn = useServerFn(enrichCompanyNow);
  const enrichMut = useMutation({
    mutationFn: () => enrichFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Enrichment kicked off — refresh in ~15s");
      // Poll for the row to land while the background task runs.
      setTimeout(() => qc.invalidateQueries({ queryKey: ["company", id] }), 8_000);
      setTimeout(() => qc.invalidateQueries({ queryKey: ["company", id] }), 20_000);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (isLoading) return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  if (!data?.company) return <div className="p-8 text-muted-foreground text-sm">Company not found. <Link to="/companies" className="underline">Back</Link></div>;

  const openValue = (data.deals ?? []).filter((d: any) => d.stage !== "won" && d.stage !== "lost").reduce((s: number, d: any) => s + Number(d.value ?? 0), 0);
  const wonValue = (data.deals ?? []).filter((d: any) => d.stage === "won").reduce((s: number, d: any) => s + Number(d.value ?? 0), 0);

  return (
    <div className="px-4 md:px-8 py-8 max-w-[1400px] mx-auto space-y-6">
      <Link to="/companies" className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3" /> All companies
      </Link>

      <header className="flex items-start gap-4">
        {data.company.logo_url ? (
          <img
            src={data.company.logo_url}
            alt=""
            className="size-12 rounded-md object-cover bg-muted"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="size-12 rounded-md bg-muted flex items-center justify-center">
            <Building2 className="size-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-medium tracking-tight" style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}>{data.company.name}</h1>
            {data.company.ticker && (
              <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-border bg-muted/50">
                {data.company.ticker}
              </span>
            )}
            {data.company.size_estimate && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {data.company.size_estimate} employees
              </span>
            )}
          </div>
          {data.company.website && (
            <a
              href={data.company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              {data.company.website.replace(/^https?:\/\//, "")}
              <ExternalLink className="size-3" />
            </a>
          )}
          {data.company.domain && !data.company.website && (
            <div className="text-sm text-muted-foreground">{data.company.domain}</div>
          )}
          {data.company.location && <div className="text-sm text-muted-foreground">{data.company.location}</div>}
          {data.company.description && (
            <p className="text-sm mt-2 max-w-2xl">{data.company.description}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => enrichMut.mutate()}
            disabled={enrichMut.isPending || data.company.enrichment_status === "running"}
          >
            <Sparkles className="size-3.5" />
            {data.company.enrichment_status === "running"
              ? "Enriching…"
              : enrichMut.isPending
                ? "Starting…"
                : "Refresh enrichment"}
          </Button>
          {data.company.last_enriched_at && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              Last enriched {formatDistanceToNow(new Date(data.company.last_enriched_at))} ago
            </span>
          )}
          {data.company.enrichment_status === "error" && data.company.enrichment_error && (
            <span className="text-[10px] text-destructive max-w-[200px] text-right">
              {data.company.enrichment_error}
            </span>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Contacts" value={data.contacts.length} />
        <Stat label="Deals" value={data.deals.length} />
        <Stat label="Open pipeline" value={`$${openValue.toLocaleString()}`} />
        <Stat label="Closed won" value={`$${wonValue.toLocaleString()}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-border p-5 space-y-4 lg:col-span-1">
          <h2 className="text-sm font-semibold">Details</h2>
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Domain</Label>
            <Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
          </div>
          <div>
            <Label>Industry</Label>
            <Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          </div>
          <div>
            <Label>Location</Label>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div>
            <Label>Employees</Label>
            <Input type="number" min={0} value={form.employee_count} onChange={(e) => setForm({ ...form, employee_count: e.target.value })} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <Button size="sm" className="gap-2 w-full" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            <Save className="size-3.5" /> {saveMut.isPending ? "Saving…" : "Save changes"}
          </Button>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Contacts</div>
            {data.contacts.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm italic">No contacts linked.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {data.contacts.map((c: any) => (
                    <tr key={c.id} className="border-t border-border first:border-t-0 hover:bg-muted/30">
                      <td className="px-4 py-3"><Link to="/contacts/$id" params={{ id: c.id }} className="font-medium hover:text-primary">{c.full_name}</Link></td>
                      <td className="px-4 py-3 text-muted-foreground">{c.title ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-right text-xs font-mono uppercase tracking-widest">{c.relationship_stage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card className="border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Deals</div>
            {data.deals.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm italic">No deals yet.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {data.deals.map((d: any) => (
                    <tr key={d.id} className="border-t border-border first:border-t-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">
                        <button
                          type="button"
                          onClick={() => peek("deal", d.id)}
                          className="text-left hover:text-primary"
                        >
                          {d.name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-mono text-xs">${Number(d.value).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-xs font-mono uppercase tracking-widest text-muted-foreground">{d.stage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {data.deals.length > 0 && methodology.key !== "none" && (
            <div className="space-y-3">
              {data.deals
                .filter((d: any) => d.stage !== "won" && d.stage !== "lost")
                .map((d: any) => (
                  <SalesReportCard
                    key={d.id}
                    dealId={d.id}
                    dealName={d.name}
                    methodology={methodology}
                    qualification={d.qualification_json}
                    invalidateKeys={[["company", id]]}
                  />
                ))}
            </div>
          )}

          <Card className="border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Recent activity
            </div>
            {data.activities.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm italic">Quiet so far.</div>
            ) : (
              <ul className="divide-y divide-border">
                {data.activities.map((a: any) => (
                  <li key={a.id} className="px-4 py-3 text-sm flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.subject}</div>
                      <div className="text-xs text-muted-foreground">{a.contact?.full_name ?? "—"} · {a.type}</div>
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="border-border p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
    </Card>
  );
}
