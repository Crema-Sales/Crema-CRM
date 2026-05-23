import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, MinusCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateDealQualification } from "@/lib/crm.functions";
import {
  type CriterionStatus,
  type DealQualification,
  type Methodology,
  qualificationScore,
} from "@/lib/sales-methodology";
import { toast } from "sonner";

// Parses the qualification_json string stored on deals.
// Defensive: anything malformed → empty map (caller treats it as all "unknown").
function parseQualification(raw: unknown): DealQualification {
  if (!raw) return {};
  if (typeof raw === "object") return raw as DealQualification;
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as DealQualification) : {};
  } catch {
    return {};
  }
}

const STATUS_ORDER: CriterionStatus[] = ["unknown", "partial", "confirmed"];

const STATUS_META: Record<
  CriterionStatus,
  { label: string; pillClass: string; icon: typeof CheckCircle2 }
> = {
  unknown: {
    label: "Unknown",
    pillClass: "border-border text-muted-foreground bg-transparent",
    icon: Circle,
  },
  partial: {
    label: "Partial",
    pillClass: "border-amber-500/40 text-amber-700 bg-amber-500/10",
    icon: MinusCircle,
  },
  confirmed: {
    label: "Confirmed",
    pillClass: "border-emerald-500/40 text-emerald-700 bg-emerald-500/10",
    icon: CheckCircle2,
  },
};

export interface SalesReportCardProps {
  dealId: string;
  dealName: string;
  methodology: Methodology;
  qualification: unknown;
  // Invalidate keys after a mutation so the parent screen refetches.
  invalidateKeys?: ReadonlyArray<ReadonlyArray<unknown>>;
}

export function SalesReportCard({
  dealId,
  dealName,
  methodology,
  qualification,
  invalidateKeys,
}: SalesReportCardProps) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateDealQualification);
  const parsed = useMemo(() => parseQualification(qualification), [qualification]);
  const [optimistic, setOptimistic] = useState<DealQualification | null>(null);
  const effective = optimistic ?? parsed;

  const mut = useMutation({
    mutationFn: (vars: { criterion_key: string; status: CriterionStatus }) =>
      updateFn({
        data: { deal_id: dealId, criterion_key: vars.criterion_key, status: vars.status },
      }),
    onMutate: (vars) => {
      setOptimistic({
        ...effective,
        [vars.criterion_key]: { ...effective[vars.criterion_key], status: vars.status },
      });
    },
    onSuccess: () => {
      setOptimistic(null);
      (invalidateKeys ?? []).forEach((key) =>
        qc.invalidateQueries({ queryKey: key as unknown[] }),
      );
    },
    onError: (e: any) => {
      setOptimistic(null);
      toast.error(e?.message ?? "Failed to update qualification");
    },
  });

  if (methodology.key === "none") {
    return (
      <Card className="border-border p-4">
        <div className="text-xs text-muted-foreground">
          No sales methodology selected for this organization. Pick one in{" "}
          <span className="font-mono">Settings → Organization</span> to enable per-deal report
          cards.
        </div>
      </Card>
    );
  }

  const score = qualificationScore(methodology, effective);
  const pctLabel = Math.round(score.pct * 100);

  return (
    <Card className="border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {methodology.name} report card
          </div>
          <div className="text-sm font-medium truncate">{dealName}</div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <div className="text-xs text-muted-foreground tabular-nums">
            {score.done} / {score.total}
          </div>
          <div
            className={cn(
              "text-xs font-mono tabular-nums px-2 py-0.5 rounded-full border",
              pctLabel >= 75
                ? "border-emerald-500/40 text-emerald-700 bg-emerald-500/10"
                : pctLabel >= 40
                ? "border-amber-500/40 text-amber-700 bg-amber-500/10"
                : "border-border text-muted-foreground",
            )}
          >
            {pctLabel}%
          </div>
        </div>
      </div>

      <ul className="divide-y divide-border">
        {methodology.criteria.map((c) => {
          const current = (effective[c.key]?.status ?? "unknown") as CriterionStatus;
          const meta = STATUS_META[current];
          const Icon = meta.icon;
          return (
            <li key={c.key} className="px-4 py-3 space-y-2">
              <div className="flex items-start gap-3">
                <Icon
                  className={cn(
                    "size-4 mt-0.5 shrink-0",
                    current === "confirmed"
                      ? "text-emerald-600"
                      : current === "partial"
                      ? "text-amber-600"
                      : "text-muted-foreground",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{c.label}</div>
                    <span
                      className={cn(
                        "font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border",
                        meta.pillClass,
                      )}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
                  <p className="text-xs italic text-muted-foreground/80 mt-1">
                    Try: &ldquo;{c.examplePrompt}&rdquo;
                  </p>
                  <div className="flex gap-1 mt-2">
                    {STATUS_ORDER.map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant={current === status ? "default" : "outline"}
                        className="h-6 text-[10px] px-2 font-mono uppercase tracking-widest"
                        disabled={mut.isPending}
                        onClick={() => mut.mutate({ criterion_key: c.key, status })}
                      >
                        {STATUS_META[status].label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
