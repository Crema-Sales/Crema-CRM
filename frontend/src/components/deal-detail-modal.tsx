import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getDeal } from "@/lib/crm.functions";
import { DEAL_STAGE_LABELS, type DealStage } from "@/lib/stages";
import { usePeek } from "@/components/peek/peek-context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Handshake, ArrowRight, Building2, User } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

type Props = {
  dealId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

// Side-panel peek at a deal from anywhere it's referenced (a contact, company,
// or relationship detail page). Header carries a "Full page" button into
// /deals/$id so the peek can escalate to the real detail route.
export function DealDetailModal({ dealId, open, onOpenChange }: Props) {
  const getFn = useServerFn(getDeal);
  const { peek } = usePeek();
  const { data, isLoading } = useQuery({
    queryKey: ["deal", dealId],
    queryFn: () => getFn({ data: { id: dealId! } }),
    enabled: Boolean(dealId) && open,
  });

  const deal = data?.deal;
  const activities = (data?.activities ?? []) as any[];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col gap-0 overflow-hidden"
      >
        {isLoading || !deal ? (
          <div className="p-10 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-border text-left space-y-0">
              <div className="flex items-start gap-3 pr-8">
                <div className="size-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                  <Handshake className="size-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-xl font-semibold tracking-tight truncate">
                    {deal.name}
                  </SheetTitle>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                    <span className="font-mono uppercase tracking-widest">
                      {DEAL_STAGE_LABELS[deal.stage as DealStage] ?? deal.stage}
                    </span>
                    <span>·</span>
                    <span className="font-semibold tabular-nums">
                      {fmtUsd(deal.value)}
                    </span>
                  </div>
                </div>
              </div>
              <Button asChild size="sm" className="gap-1.5 mt-4 w-fit">
                <Link
                  to="/deals/$id"
                  params={{ id: deal.id }}
                  onClick={() => onOpenChange(false)}
                >
                  Open full deal page
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Value" value={fmtUsd(deal.value)} />
                <Stat label="Probability" value={`${deal.probability ?? 0}%`} />
                <Stat
                  label="Expected close"
                  value={
                    deal.expected_close
                      ? format(new Date(deal.expected_close), "MMM d, yyyy")
                      : "—"
                  }
                />
                <Stat label="Activities" value={activities.length} />
              </div>

              {(deal.company || deal.contact) && (
                <div>
                  <SectionLabel>Linked records</SectionLabel>
                  <ul className="mt-1.5 divide-y divide-border rounded-md border border-border">
                    {deal.company && (
                      <li>
                        <button
                          type="button"
                          onClick={() => peek("company", deal.company.id)}
                          className="w-full px-3 py-2 flex items-center gap-3 text-sm text-left hover:bg-muted/40 transition-colors"
                        >
                          <Building2 className="size-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {deal.company.name}
                            </div>
                            {deal.company.industry && (
                              <div className="text-xs text-muted-foreground truncate">
                                {deal.company.industry}
                              </div>
                            )}
                          </div>
                        </button>
                      </li>
                    )}
                    {deal.contact && (
                      <li>
                        <button
                          type="button"
                          onClick={() => peek("contact", deal.contact.id)}
                          className="w-full px-3 py-2 flex items-center gap-3 text-sm text-left hover:bg-muted/40 transition-colors"
                        >
                          <User className="size-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {deal.contact.full_name}
                            </div>
                            {deal.contact.email && (
                              <div className="text-xs text-muted-foreground truncate">
                                {deal.contact.email}
                              </div>
                            )}
                          </div>
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              )}

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
                          <div className="text-xs text-muted-foreground font-mono uppercase tracking-widest">
                            {a.type}
                          </div>
                        </div>
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(a.occurred_at), {
                            addSuffix: true,
                          })}
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
