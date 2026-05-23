import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getMyCoachPersona, setMyCoachPersona } from "@/auth/coach-persona-fns";
import {
  COACH_PERSONAS_BY_SLUG,
  SALES_CONTEXT_LABEL,
} from "@/lib/coach-personas";
import { CoachPickerDialog } from "@/components/coach-picker";

/**
 * Settings panel for the optional coach persona. Lets reps who skipped
 * onboarding (or want to switch) browse the catalog and pick / clear a
 * coach without re-running the onboarding flow.
 *
 * Persona changes rebake the auth cookie server-side, but the open WS
 * connection to the agent DO will still carry the previous slug until the
 * next reconnect. The hint copy mentions this — close + reopen the chat
 * popover to pick up the new voice.
 */
export function CoachPersonaSection() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMyCoachPersona);
  const setFn = useServerFn(setMyCoachPersona);
  const [pickerOpen, setPickerOpen] = useState(false);

  const current = useQuery({
    queryKey: ["my-coach-persona"],
    queryFn: () => getFn(),
  });

  const saveMut = useMutation({
    mutationFn: (slug: string | null) => setFn({ data: { slug } }),
    onSuccess: (_data, slug) => {
      qc.invalidateQueries({ queryKey: ["my-coach-persona"] });
      setPickerOpen(false);
      toast.success(slug ? "Coach updated" : "Coach cleared");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to update coach"),
  });

  const currentSlug = current.data?.slug ?? null;
  const persona = currentSlug ? COACH_PERSONAS_BY_SLUG[currentSlug] ?? null : null;

  return (
    <Card className="border-border p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Sales coach</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Your copilot adopts this voice in chat. Close and reopen the assistant after changing to
          pick up the new persona.
        </p>
      </div>

      {persona ? (
        <div className="flex items-start gap-4">
          <img
            src={persona.headshotPath}
            alt={persona.name}
            className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-border"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold">{persona.name}</p>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {persona.archetype}
              </p>
            </div>
            <p className="mt-1 text-xs italic text-muted-foreground line-clamp-2">
              "{persona.tagline}"
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {persona.salesContexts.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-foreground"
                >
                  {SALES_CONTEXT_LABEL[c]}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-sm font-medium">No coach picked yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            The copilot will use the default Crema voice until you pick a coach.
          </p>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {persona ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => saveMut.mutate(null)}
            disabled={saveMut.isPending}
          >
            Clear coach
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={() => setPickerOpen(true)}
          disabled={current.isLoading}
        >
          {persona ? "Change coach" : "Pick a coach"}
        </Button>
      </div>

      <CoachPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        currentSlug={currentSlug}
        saving={saveMut.isPending}
        onPick={(slug) => saveMut.mutate(slug)}
      />
    </Card>
  );
}
