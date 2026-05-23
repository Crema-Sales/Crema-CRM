// Per-member quota editor (Settings → Organization). Lives in its own card
// so the existing Members card (remove flow + invites) stays untouched.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getOrgDetails } from "@/auth/org-fns";
import {
  listOrgQuotas,
  setMemberQuota,
  clearMemberQuota,
} from "@/auth/quota-fns";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { toast } from "sonner";

type PeriodType = "monthly" | "quarterly";

interface QuotaRow {
  user_id: string;
  quota: { amount: number; period_type: PeriodType } | null;
  attained: { amount: number; deal_count: number };
  pipeline: { amount: number; deal_count: number };
  forecast: { amount: number };
  period: { start: string; end: string; days_total: number; days_elapsed: number } | null;
}

interface MemberRowLite {
  user_id: string;
  email: string;
  full_name: string | null;
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
}

export function MembersQuotasSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOrgQuotas);
  const setFn = useServerFn(setMemberQuota);
  const clearFn = useServerFn(clearMemberQuota);
  const detailsFn = useServerFn(getOrgDetails);
  const { orgId } = useCurrentOrg();

  const detailsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["org-details", orgId],
    queryFn: () => detailsFn({ data: { org_id: orgId! } }),
  });

  const quotasQ = useQuery({
    enabled: !!orgId,
    queryKey: ["org-quotas", orgId],
    queryFn: () => listFn({ data: { org_id: orgId! } }) as Promise<QuotaRow[]>,
  });

  const members: MemberRowLite[] = detailsQ.data?.members ?? [];

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["org-quotas", orgId] });

  const setMut = useMutation({
    mutationFn: (v: {
      user_id: string;
      amount: number;
      period_type: PeriodType;
    }) =>
      setFn({
        data: {
          org_id: orgId!,
          user_id: v.user_id,
          amount: v.amount,
          period_type: v.period_type,
        },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Quota saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const clearMut = useMutation({
    mutationFn: (user_id: string) =>
      clearFn({ data: { org_id: orgId!, user_id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Quota cleared");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to clear"),
  });

  if (!orgId || !quotasQ.data || !detailsQ.data) return null;

  const byUser = new Map<string, QuotaRow>(
    quotasQ.data.map((q) => [q.user_id, q]),
  );

  return (
    <Card className="border-border p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Quotas</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Set a monthly or quarterly target for each rep. The bar shows
          closed-won (solid) plus weighted pipeline (striped) against quota
          for the current period.
        </p>
      </div>

      <div className="space-y-1.5">
        {members.map((m) => {
          const row = byUser.get(m.user_id);
          return (
            <MemberQuotaRow
              key={m.user_id}
              member={m}
              row={row}
              busy={setMut.isPending || clearMut.isPending}
              onSave={(amount, period_type) =>
                setMut.mutate({ user_id: m.user_id, amount, period_type })
              }
              onClear={() => clearMut.mutate(m.user_id)}
            />
          );
        })}
      </div>
    </Card>
  );
}

function MemberQuotaRow({
  member,
  row,
  busy,
  onSave,
  onClear,
}: {
  member: MemberRowLite;
  row: QuotaRow | undefined;
  busy: boolean;
  onSave: (amount: number, period_type: PeriodType) => void;
  onClear: () => void;
}) {
  const initialAmount = row?.quota?.amount ?? 0;
  const initialPeriod: PeriodType = row?.quota?.period_type ?? "quarterly";

  const [amount, setAmount] = useState<string>(String(initialAmount || ""));
  const [period, setPeriod] = useState<PeriodType>(initialPeriod);

  // Re-sync local state when the server data refreshes after a save from
  // somewhere else. Avoids a stale-edit footgun.
  useEffect(() => {
    setAmount(String(row?.quota?.amount ?? ""));
    setPeriod(row?.quota?.period_type ?? "quarterly");
  }, [row?.quota?.amount, row?.quota?.period_type]);

  const commit = () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Quota must be a non-negative number");
      return;
    }
    if (n === (row?.quota?.amount ?? 0) && period === (row?.quota?.period_type ?? "quarterly")) {
      return; // no-op
    }
    onSave(n, period);
  };

  const attained = row?.attained.amount ?? 0;
  const pipeline = row?.pipeline.amount ?? 0;
  const quotaAmount = row?.quota?.amount ?? 0;
  const denom = Math.max(quotaAmount, attained + pipeline, 1);
  const attainedPct = (attained / denom) * 100;
  const pipelinePct = (pipeline / denom) * 100;
  const forecastPct = quotaAmount > 0 ? ((attained + pipeline) / quotaAmount) * 100 : 0;

  // On-pace coloring: green ≥1.0, amber ≥0.8, red below.
  const pace = (() => {
    if (!row?.period || !quotaAmount) return null;
    const expected = (quotaAmount * row.period.days_elapsed) / row.period.days_total;
    if (expected === 0) return null;
    const ratio = attained / expected;
    if (ratio >= 1.0) return { label: "on pace", className: "text-emerald-600" };
    if (ratio >= 0.8) return { label: "behind pace", className: "text-amber-600" };
    return { label: "off pace", className: "text-red-600" };
  })();

  return (
    <div className="px-3 py-2.5 rounded-md border border-border space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs">
          {member.full_name ? `${member.full_name} · ` : ""}
          <span className="text-muted-foreground">{member.email}</span>
        </span>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
              $
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder="0"
              className="w-28 pl-5 text-right font-mono text-xs"
            />
          </div>
          <Select
            value={period}
            onValueChange={(v: PeriodType) => {
              setPeriod(v);
              const n = Number(amount);
              if (Number.isFinite(n) && n > 0) onSave(n, v);
            }}
          >
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            disabled={busy || !row?.quota}
            onClick={onClear}
            aria-label="Clear quota"
            title="Clear quota"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {row?.quota ? (
        <div className="space-y-1">
          <div className="relative h-2 rounded-full bg-muted overflow-hidden">
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
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground tabular-nums">
            <span>
              <span className="text-foreground">{fmtMoney(attained)} closed</span>
              {pipeline > 0 && (
                <>
                  {" "}+ <span>{fmtMoney(pipeline)} pipeline</span>
                </>
              )}
              {" "}/ {fmtMoney(quotaAmount)} {row.quota.period_type}
            </span>
            <span className="flex items-center gap-2">
              <span>{Math.round(forecastPct)}%</span>
              {pace && (
                <span className={`uppercase tracking-widest text-[9px] ${pace.className}`}>
                  {pace.label}
                </span>
              )}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground italic">
          No quota set. Enter an amount and pick a period to start tracking.
        </p>
      )}
    </div>
  );
}
