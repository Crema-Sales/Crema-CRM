import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listOrgPrompts,
  upsertOrgPrompt,
  resetOrgPrompt,
  getEnrichmentSettings,
  setEnrichmentEnabled,
} from "@/lib/crm.functions";
import { PROMPT_LABELS, type PromptKey } from "@/lib/prompts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RotateCcw, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

/**
 * The Prompts settings tab. One textarea per editable prompt key with a
 * Reset-to-default button. Edits go through the org-scoped upsertOrgPrompt
 * server fn (admin/manager-only). Also hosts the enrichment kill switch —
 * orgs can flip auto-enrichment off without touching individual prompts.
 *
 * The Crema base copilot prompt is deliberately not exposed here; it
 * encodes the safety/scope contract that the rep copilot runs on. Only the
 * org overlay sits on top of it.
 */
export function PromptsSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOrgPrompts);
  const upsertFn = useServerFn(upsertOrgPrompt);
  const resetFn = useServerFn(resetOrgPrompt);
  const getSettingsFn = useServerFn(getEnrichmentSettings);
  const setEnabledFn = useServerFn(setEnrichmentEnabled);

  const promptsQ = useQuery({
    queryKey: ["org-prompts"],
    queryFn: () => listFn(),
  });
  const settingsQ = useQuery({
    queryKey: ["enrichment-settings"],
    queryFn: () => getSettingsFn(),
  });

  const setEnabledMut = useMutation({
    mutationFn: (enabled: boolean) => setEnabledFn({ data: { enabled } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["enrichment-settings"] });
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-5">
      <Card className="border-border p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="size-3.5" />
              Auto-enrichment
            </h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-prose">
              When on, new companies (with a domain) and new contacts (with a
              business email) are automatically enriched in the background.
              Manual Refresh buttons on detail panes work either way.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label htmlFor="enrichment-switch" className="text-xs">
              {settingsQ.data?.enabled ? "On" : "Off"}
            </Label>
            <Switch
              id="enrichment-switch"
              checked={settingsQ.data?.enabled ?? false}
              onCheckedChange={(v) => setEnabledMut.mutate(v)}
              disabled={settingsQ.isLoading || setEnabledMut.isPending}
            />
          </div>
        </div>
      </Card>

      {promptsQ.isLoading && (
        <div className="text-sm text-muted-foreground">Loading prompts…</div>
      )}
      {promptsQ.data?.prompts.map((row) => (
        <PromptCard
          key={row.key}
          promptKey={row.key as PromptKey}
          body={row.body}
          isDefault={row.is_default}
          defaultBody={promptsQ.data!.defaults[row.key as PromptKey]}
          updatedAt={row.updated_at}
          onSave={async (body) => {
            await upsertFn({ data: { key: row.key, body } });
            qc.invalidateQueries({ queryKey: ["org-prompts"] });
            toast.success("Prompt saved");
          }}
          onReset={async () => {
            await resetFn({ data: { key: row.key } });
            qc.invalidateQueries({ queryKey: ["org-prompts"] });
            toast.success("Reset to default");
          }}
        />
      ))}
    </div>
  );
}

function PromptCard({
  promptKey,
  body,
  isDefault,
  defaultBody,
  updatedAt,
  onSave,
  onReset,
}: {
  promptKey: PromptKey;
  body: string;
  isDefault: boolean;
  defaultBody: string;
  updatedAt: string | null;
  onSave: (body: string) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const label = PROMPT_LABELS[promptKey];
  const [draft, setDraft] = useState(body);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  useEffect(() => {
    setDraft(body);
  }, [body]);
  const dirty = draft !== body;

  return (
    <Card className="border-border p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">{label.title}</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-prose">{label.help}</p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">
          {isDefault ? "default" : "overridden"}
        </span>
      </div>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={Math.min(20, Math.max(6, Math.ceil(draft.length / 90)))}
        placeholder={
          promptKey === "org_overlay"
            ? "e.g. Our ICP is series-B FinTech. Always close by asking for a champion intro, never a price quote."
            : defaultBody
        }
        className="font-mono text-xs"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {updatedAt ? `Updated ${new Date(updatedAt).toLocaleString()}` : "Never edited"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              setResetting(true);
              try {
                await onReset();
              } finally {
                setResetting(false);
              }
            }}
            disabled={isDefault || resetting || saving}
            className="gap-1.5"
          >
            <RotateCcw className="size-3.5" />
            {resetting ? "Resetting…" : "Reset to default"}
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(draft);
              } finally {
                setSaving(false);
              }
            }}
            disabled={!dirty || saving || resetting}
            className="gap-1.5"
          >
            <Save className="size-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
