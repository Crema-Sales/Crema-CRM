import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  getOrgStageProbabilities,
  updateOrgStageProbability,
} from "@/auth/org-fns";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DEAL_STAGE_LABELS, type DealStage } from "@/lib/stages";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { toast } from "sonner";

export function StageProbabilitiesSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(getOrgStageProbabilities);
  const updateFn = useServerFn(updateOrgStageProbability);
  const { orgId } = useCurrentOrg();

  const probsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["stage-probabilities", orgId],
    queryFn: () => listFn({ data: { org_id: orgId! } }),
  });

  // Local edit buffer keyed by stage so an in-flight edit doesn't flicker
  // when the query refetches. We only push to the server on blur or Enter.
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (probsQ.data) {
      setDraft(
        Object.fromEntries(probsQ.data.map((r) => [r.stage, String(r.probability)])),
      );
    }
  }, [probsQ.data]);

  const saveMut = useMutation({
    mutationFn: (vars: { stage: DealStage; probability: number }) =>
      updateFn({
        data: { org_id: orgId!, stage: vars.stage, probability: vars.probability },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stage-probabilities", orgId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  if (!orgId || !probsQ.data) return null;

  const commit = (stage: DealStage, raw: string) => {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error("Confidence must be between 0 and 100");
      // Reset draft to server value.
      const current = probsQ.data.find((r) => r.stage === stage);
      if (current) setDraft((d) => ({ ...d, [stage]: String(current.probability) }));
      return;
    }
    const current = probsQ.data.find((r) => r.stage === stage);
    if (current?.probability === n) return; // no-op
    saveMut.mutate({ stage, probability: n });
  };

  return (
    <Card className="border-border p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Pipeline stages</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Confidence percentages drive your weighted pipeline. A $100k deal at{" "}
          <span className="font-mono">Proposal</span> with 50% confidence counts as
          $50k in the forecast; <span className="font-mono">Won</span> = 100% closed,{" "}
          <span className="font-mono">Lost</span> = 0%.
        </p>
      </div>

      <div className="space-y-1.5">
        {probsQ.data.map(({ stage, probability }) => (
          <div
            key={stage}
            className="flex items-center gap-3 px-3 py-2 rounded-md border border-border"
          >
            <span className="flex-1 text-xs font-medium">
              {DEAL_STAGE_LABELS[stage as DealStage]}
            </span>
            <div className="w-40">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${probability}%` }}
                />
              </div>
            </div>
            <div className="relative">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                value={draft[stage] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [stage]: e.target.value }))}
                onBlur={(e) => commit(stage as DealStage, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="w-20 pr-7 text-right font-mono text-xs"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                %
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
        Changes apply to new deals and to existing deals when their stage changes.
      </p>
    </Card>
  );
}
