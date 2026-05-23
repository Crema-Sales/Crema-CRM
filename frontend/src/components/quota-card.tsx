// Rep dashboard quota card: stacked progress (closed + striped pipeline)
// against the active quota for the current period, with an on-pace pill.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Target } from "lucide-react";
import { getMyQuota } from "@/auth/quota-fns";

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
}

export function QuotaCard() {
  const fn = useServerFn(getMyQuota);
  const q = useQuery({ queryKey: ["my-quota"], queryFn: () => fn() });

  if (!q.data) return null;
  const { quota, attained, pipeline, forecast, period } = q.data;

  if (!quota || !period) {
    return (
      <Card className="border-dashed border-border p-4 flex items-center gap-3 text-xs text-muted-foreground">
        <Target className="size-4" />
        <span className="flex-1">
          No quota set yet. An org admin can configure one from{" "}
          <Link to="/settings" className="underline underline-offset-2">
            Settings → Organization
          </Link>
          .
        </span>
      </Card>
    );
  }

  const denom = Math.max(quota.amount, forecast.amount, 1);
  const attainedPct = (attained.amount / denom) * 100;
  const pipelinePct = (pipeline.amount / denom) * 100;
  const quotaPct = quota.amount > 0 ? (forecast.amount / quota.amount) * 100 : 0;

  const expected = (quota.amount * period.days_elapsed) / period.days_total;
  const pace = (() => {
    if (expected === 0) return null;
    const ratio = attained.amount / expected;
    if (ratio >= 1.0) return { label: "on pace", className: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30" };
    if (ratio >= 0.8) return { label: "behind pace", className: "text-amber-600 bg-amber-500/10 border-amber-500/30" };
    return { label: "off pace", className: "text-red-600 bg-red-500/10 border-red-500/30" };
  })();

  const periodLabel = quota.period_type === "monthly" ? "this month" : "this quarter";

  return (
    <Card className="border-border p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-8 rounded-lg flex items-center justify-center bg-[#c9885a]/15 text-[#c9885a]">
            <Target className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Quota · {periodLabel}
            </div>
            <div className="text-sm font-medium tabular-nums">
              <span className="text-foreground">{fmtMoney(attained.amount)} closed</span>
              {pipeline.amount > 0 && (
                <>
                  {" "}+ <span className="text-muted-foreground">{fmtMoney(pipeline.amount)} pipeline</span>
                </>
              )}
              {" "}= <span className="text-foreground">{fmtMoney(forecast.amount)} forecast</span>
              <span className="text-muted-foreground"> / {fmtMoney(quota.amount)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">{Math.round(quotaPct)}%</span>
          {pace && (
            <span
              className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded border ${pace.className}`}
            >
              {pace.label}
            </span>
          )}
        </div>
      </div>

      <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-primary"
          style={{ width: `${Math.min(100, attainedPct)}%` }}
        />
        <div
          className="absolute inset-y-0 bg-primary/40"
          style={{
            left: `${Math.min(100, attainedPct)}%`,
            width: `${Math.min(100 - attainedPct, pipelinePct)}%`,
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.18) 4px, rgba(0,0,0,0.18) 8px)",
          }}
        />
        {/* Pace marker: where you'd be if attainment matched calendar-elapsed share of quota. */}
        {period.days_total > 0 && (
          <div
            className="absolute inset-y-0 w-px bg-foreground/40"
            style={{
              left: `${Math.min(100, (expected / denom) * 100)}%`,
            }}
            aria-label="pace marker"
            title="Calendar pace"
          />
        )}
      </div>

      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>
          {attained.deal_count} won · {pipeline.deal_count} in flight
        </span>
        <span>
          day {period.days_elapsed} / {period.days_total}
        </span>
      </div>
    </Card>
  );
}
