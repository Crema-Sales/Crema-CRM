import { useMemo, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  COACH_PERSONAS,
  SALES_CONTEXTS,
  SALES_CONTEXT_LABEL,
  type CoachPersona,
  type SalesContext,
} from "@/lib/coach-personas";

/**
 * Gallery + detail-drawer for picking (or clearing) a coach. Stateless wrt
 * persistence — the parent handles the actual save via `onPick`. Used both
 * standalone on `/onboarding/coach` and wrapped in a `Dialog` from settings.
 */
export function CoachPickerGallery({
  currentSlug,
  saving,
  onPick,
  onSkip,
  skipLabel = "Skip for now",
}: {
  currentSlug: string | null;
  saving: boolean;
  onPick: (slug: string) => void;
  onSkip?: () => void;
  skipLabel?: string;
}) {
  const [filter, setFilter] = useState<SalesContext | null>(null);
  const [selected, setSelected] = useState<CoachPersona | null>(null);

  const visible = useMemo(
    () =>
      filter ? COACH_PERSONAS.filter((p) => p.salesContexts.includes(filter)) : COACH_PERSONAS,
    [filter],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <FilterChip label="All" active={filter === null} onClick={() => setFilter(null)} />
        {SALES_CONTEXTS.map((ctx) => (
          <FilterChip
            key={ctx}
            label={SALES_CONTEXT_LABEL[ctx]}
            active={filter === ctx}
            onClick={() => setFilter(ctx)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p) => (
          <PersonaCard
            key={p.slug}
            persona={p}
            current={p.slug === currentSlug}
            onOpen={() => setSelected(p)}
          />
        ))}
      </div>

      {onSkip ? (
        <div className="flex flex-col items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onSkip}
            disabled={saving}
            className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
          >
            {skipLabel}
          </button>
        </div>
      ) : null}

      {selected ? (
        <PersonaDetailModal
          persona={selected}
          current={selected.slug === currentSlug}
          onClose={() => setSelected(null)}
          onPick={() => onPick(selected.slug)}
          saving={saving}
        />
      ) : null}
    </div>
  );
}

/**
 * Dialog-wrapped gallery for settings. The settings page passes the current
 * slug so the picker can mark the active coach, and a save handler that
 * closes the dialog on success.
 */
export function CoachPickerDialog({
  open,
  onOpenChange,
  currentSlug,
  saving,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSlug: string | null;
  saving: boolean;
  onPick: (slug: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(96vw,72rem)] max-w-none overflow-y-auto">
        <DialogTitle className="text-base">Pick a coach</DialogTitle>
        <DialogDescription>
          Your copilot will adopt this voice when it coaches you through deals.
        </DialogDescription>
        <CoachPickerGallery currentSlug={currentSlug} saving={saving} onPick={onPick} />
      </DialogContent>
    </Dialog>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:bg-muted/30"
      }`}
    >
      {label}
    </button>
  );
}

function PersonaCard({
  persona,
  current,
  onOpen,
}: {
  persona: CoachPersona;
  current: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group flex flex-col gap-3 rounded-xl border bg-background p-4 text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30 ${
        current ? "border-foreground ring-1 ring-foreground/20" : "border-border"
      }`}
    >
      <div className="flex items-center gap-3">
        <img
          src={persona.headshotPath}
          alt={persona.name}
          className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-border"
          loading="lazy"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold">{persona.name}</p>
            {current ? (
              <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-background">
                Current
              </span>
            ) : null}
          </div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {persona.archetype}
          </p>
        </div>
      </div>
      <p className="text-xs italic text-muted-foreground line-clamp-2">"{persona.tagline}"</p>
      <div className="mt-auto flex flex-wrap gap-1">
        {persona.salesContexts.map((c) => (
          <span
            key={c}
            className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-foreground"
          >
            {SALES_CONTEXT_LABEL[c]}
          </span>
        ))}
      </div>
    </button>
  );
}

function PersonaDetailModal({
  persona,
  current,
  onClose,
  onPick,
  saving,
}: {
  persona: CoachPersona;
  current: boolean;
  onClose: () => void;
  onPick: () => void;
  saving: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <img
            src={persona.headshotPath}
            alt={persona.name}
            className="h-20 w-20 shrink-0 rounded-full object-cover ring-1 ring-border"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">{persona.name}</h2>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {persona.archetype} · Energy {persona.energy}/10 · {persona.energyDescriptor}
            </p>
            <p className="mt-2 text-sm italic text-muted-foreground">"{persona.tagline}"</p>
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
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="mt-4 text-sm text-foreground">{persona.hook}</p>

        <Section title="Signature moves">
          <ul className="space-y-2">
            {persona.signatureTechniques.map((t) => (
              <li key={t.name} className="text-sm">
                <span className="font-semibold">{t.name}</span>
                <span className="text-muted-foreground"> — {t.description}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Catchphrases">
          <ul className="space-y-1">
            {persona.catchphrases.map((q, i) => (
              <li key={i} className="text-sm italic text-muted-foreground">
                "{q}"
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Best fit for">
          <p className="text-sm text-muted-foreground">{persona.bestFitFor}</p>
        </Section>

        <Section title="Avoid if">
          <p className="text-sm text-muted-foreground">{persona.avoidIf}</p>
        </Section>

        <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-muted-foreground hover:underline"
          >
            Back to gallery
          </button>
          <button
            type="button"
            onClick={onPick}
            disabled={saving}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : current
                ? `Continue with ${persona.name.split(" ")[0]}`
                : `Pick ${persona.name.split(" ")[0]}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}
