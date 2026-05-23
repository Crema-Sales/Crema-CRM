import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { enrichCompanyNow, getCompany } from "@/lib/crm.functions";
import { usePeek } from "@/components/peek/peek-context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Building2,
  ArrowRight,
  MapPin,
  Users,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type Props = {
  companyId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// Side-panel peek at a company from anywhere it's referenced (e.g. the contacts
// table). Header carries a "Full page" button into /companies/$id so the peek
// can escalate to the real detail route.
export function CompanyDetailModal({ companyId, open, onOpenChange }: Props) {
  const getFn = useServerFn(getCompany);
  const enrichFn = useServerFn(enrichCompanyNow);
  const qc = useQueryClient();
  const { peek } = usePeek();
  const { data, isLoading } = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => getFn({ data: { id: companyId! } }),
    enabled: Boolean(companyId) && open,
  });
  const enrichMut = useMutation({
    mutationFn: () => enrichFn({ data: { id: companyId! } }),
    onSuccess: () => {
      toast.success("Enrichment kicked off");
      setTimeout(() => qc.invalidateQueries({ queryKey: ["company", companyId] }), 8_000);
      setTimeout(() => qc.invalidateQueries({ queryKey: ["company", companyId] }), 20_000);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const company = data?.company;
  const contacts = (data?.contacts ?? []) as any[];
  const deals = (data?.deals ?? []) as any[];
  const activities = (data?.activities ?? []) as any[];

  const openValue = deals
    .filter((d: any) => d.stage !== "won" && d.stage !== "lost")
    .reduce((s: number, d: any) => s + Number(d.value ?? 0), 0);
  const wonValue = deals
    .filter((d: any) => d.stage === "won")
    .reduce((s: number, d: any) => s + Number(d.value ?? 0), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col gap-0 overflow-hidden"
      >
        {isLoading || !company ? (
          <div className="p-10 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-border text-left space-y-0">
              <div className="flex items-start gap-3 pr-8">
                {company.logo_url ? (
                  <img
                    src={company.logo_url}
                    alt=""
                    className="size-10 rounded-md object-cover bg-muted shrink-0"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="size-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Building2 className="size-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SheetTitle className="text-xl font-semibold tracking-tight truncate">
                      {company.name}
                    </SheetTitle>
                    {company.ticker && (
                      <span className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-full border border-border bg-muted/50">
                        {company.ticker}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                    {company.website ? (
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {company.website.replace(/^https?:\/\//, "")}
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      company.domain && <div>{company.domain}</div>
                    )}
                    {company.industry && <div>{company.industry}</div>}
                    {company.location && (
                      <div className="inline-flex items-center gap-1">
                        <MapPin className="size-3" />
                        {company.location}
                      </div>
                    )}
                    {(company.size_estimate || company.employee_count != null) && (
                      <div className="inline-flex items-center gap-1">
                        <Users className="size-3" />
                        {company.size_estimate ?? `${company.employee_count} employees`}
                      </div>
                    )}
                  </div>
                  {company.description && (
                    <p className="text-sm mt-2 text-foreground/90">{company.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 gap-2">
                <Button asChild size="sm" className="gap-1.5 w-fit">
                  <Link
                    to="/companies/$id"
                    params={{ id: company.id }}
                    onClick={() => onOpenChange(false)}
                  >
                    Open full company page
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
                <div className="flex flex-col items-end gap-0.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => enrichMut.mutate()}
                    disabled={enrichMut.isPending || company.enrichment_status === "running"}
                  >
                    <Sparkles className="size-3.5" />
                    {company.enrichment_status === "running"
                      ? "Enriching…"
                      : enrichMut.isPending
                        ? "Starting…"
                        : "Refresh"}
                  </Button>
                  {company.last_enriched_at && (
                    <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      {formatDistanceToNow(new Date(company.last_enriched_at))} ago
                    </span>
                  )}
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Contacts" value={contacts.length} />
                <Stat label="Deals" value={deals.length} />
                <Stat label="Open pipeline" value={`$${openValue.toLocaleString()}`} />
                <Stat label="Closed won" value={`$${wonValue.toLocaleString()}`} />
              </div>

              {company.notes && (
                <div>
                  <SectionLabel>Notes</SectionLabel>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1.5">
                    {company.notes}
                  </p>
                </div>
              )}

              <div>
                <SectionLabel>Contacts</SectionLabel>
                {contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic mt-1.5">
                    No contacts linked.
                  </p>
                ) : (
                  <ul className="mt-1.5 divide-y divide-border rounded-md border border-border">
                    {contacts.map((c: any) => (
                      <li
                        key={c.id}
                        className="px-3 py-2 flex items-center justify-between gap-3 text-sm"
                      >
                        <Link
                          to="/contacts/$id"
                          params={{ id: c.id }}
                          onClick={() => onOpenChange(false)}
                          className="font-medium hover:text-primary truncate"
                        >
                          {c.full_name}
                        </Link>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {c.title ?? "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <SectionLabel>Deals</SectionLabel>
                {deals.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic mt-1.5">
                    No deals yet.
                  </p>
                ) : (
                  <ul className="mt-1.5 divide-y divide-border rounded-md border border-border">
                    {deals.map((d: any) => (
                      <li
                        key={d.id}
                        className="px-3 py-2 flex items-center justify-between gap-3 text-sm"
                      >
                        <button
                          type="button"
                          onClick={() => peek("deal", d.id)}
                          className="font-medium truncate text-left hover:text-primary"
                        >
                          {d.name}
                        </button>
                        <span className="shrink-0 flex items-center gap-2">
                          <span className="tabular-nums font-mono text-xs">
                            ${Number(d.value ?? 0).toLocaleString()}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                            {d.stage}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <SectionLabel>Recent activity</SectionLabel>
                {activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic mt-1.5">
                    Quiet so far.
                  </p>
                ) : (
                  <ul className="mt-1.5 space-y-2">
                    {activities.slice(0, 8).map((a: any) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate">{a.subject}</div>
                          <div className="text-xs text-muted-foreground">
                            {a.contact?.full_name ?? "—"} · {a.type}
                          </div>
                        </div>
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(a.occurred_at), { addSuffix: true })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="border-border p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-semibold mt-0.5 tabular-nums">{value}</div>
    </Card>
  );
}
