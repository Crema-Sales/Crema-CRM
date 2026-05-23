import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getFunnel, toggleTask, archiveContact, autoAdvanceStage, advanceStageManually, listUnclaimedLeads, claimContact } from "@/lib/crm.functions";
import { motion, AnimatePresence } from "framer-motion";
import { Coffee, Check, ArrowRight, Flame, Sparkles, Award, Archive, Wand2, X, UserPlus } from "lucide-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useRegisterHelp } from "@/hooks/use-help";
import { funnelHelpContent } from "@/components/help/content/funnel-help";
import { ContactDetailModal } from "@/components/contact-detail-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/funnel")({ component: FunnelPage });

type Stage = "lead" | "contact" | "deal" | "customer";

const NEXT_STAGE: Record<Stage, Stage | null> = {
  lead: "contact",
  contact: "deal",
  deal: "customer",
  customer: null,
};

const STAGE_LABEL: Record<Stage, string> = {
  lead: "Lead",
  contact: "Contact",
  deal: "Deal",
  customer: "Customer",
};

const STAGES: { key: Stage; label: string; copy: (n: number) => string; icon: any; widthPct: number }[] = [
  { key: "lead",     label: "Lead",     copy: (n) => `${n} ${n === 1 ? "lead warming up" : "leads warming up"}`,            icon: Sparkles, widthPct: 100 },
  { key: "contact",  label: "Contact",  copy: (n) => `${n} in conversation`,                                                  icon: Coffee,   widthPct: 82 },
  { key: "deal",     label: "Deal",     copy: (n) => `${n} ${n === 1 ? "deal on the bench" : "deals on the bench"}`,          icon: Flame,    widthPct: 62 },
  { key: "customer", label: "Customer", copy: (n) => `${n} ${n === 1 ? "relationship brewed" : "relationships brewed"}`,      icon: Award,    widthPct: 44 },
];

const STAGE_TINTS: Record<Stage, string> = {
  lead:     "linear-gradient(135deg, color-mix(in oklab, var(--accent) 8%, var(--card)), var(--card))",
  contact:  "linear-gradient(135deg, color-mix(in oklab, var(--accent) 22%, var(--card)), var(--card))",
  deal:     "linear-gradient(135deg, color-mix(in oklab, var(--accent) 45%, var(--card)), color-mix(in oklab, var(--accent) 12%, var(--card)))",
  customer: "linear-gradient(135deg, #3b2418, #c9885a)",
};

function FunnelPage() {
  useRegisterHelp(funnelHelpContent);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchFunnel = useServerFn(getFunnel);
  const toggleFn = useServerFn(toggleTask);
  const archiveFn = useServerFn(archiveContact);
  const autoFn = useServerFn(autoAdvanceStage);
  const advanceFn = useServerFn(advanceStageManually);
  const { data } = useQuery({ queryKey: ["funnel"], queryFn: () => fetchFunnel() });

  const toggle = useMutation({
    mutationFn: (v: { id: string; completed: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["funnel"] }),
  });
  const archive = useMutation({
    mutationFn: (contactId: string) => archiveFn({ data: { contactId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["funnel"] });
      toast.success("Relationship archived");
    },
  });
  const auto = useMutation({
    mutationFn: (stage: "lead" | "contact" | "deal") => autoFn({ data: { stage } }),
    onSuccess: (res, stage) => {
      qc.invalidateQueries({ queryKey: ["funnel"] });
      const label = stage.charAt(0).toUpperCase() + stage.slice(1);
      toast.success(res.advanced > 0 ? `Brewed ${res.advanced} ${label}${res.advanced === 1 ? "" : "s"} forward` : `Nothing to brew in ${label}`);
    },
  });
  const advance = useMutation({
    mutationFn: (v: { contactId: string; toStage: Stage }) => advanceFn({ data: v }),
    onSuccess: (_res, v) => {
      qc.invalidateQueries({ queryKey: ["funnel"] });
      toast.success(`Moved to ${STAGE_LABEL[v.toStage]}`);
    },
  });

  // Unowned inbound leads (form fills via the public tracker land with
  // owner_id = NULL). Polled every 30s so a rep sitting on /funnel sees new
  // ones land without a manual refresh.
  const fetchUnclaimed = useServerFn(listUnclaimedLeads);
  const claimFn = useServerFn(claimContact);
  const { data: unclaimed = [] } = useQuery({
    queryKey: ["unclaimed-leads"],
    queryFn: () => fetchUnclaimed(),
    refetchInterval: 30_000,
  });
  const claim = useMutation({
    mutationFn: (contactId: string) => claimFn({ data: { contactId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unclaimed-leads"] });
      qc.invalidateQueries({ queryKey: ["funnel"] });
      toast.success("Lead claimed — added to your funnel");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to claim"),
  });

  const stuck = (data ? Object.values(data.grouped).flat() : []).filter((c: any) => c.relationship_stage !== "customer" && c.daysInStage > 7);
  const [stuckOpen, setStuckOpen] = useState(false);
  const [unclaimedOpen, setUnclaimedOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const stuckHot = stuck.length > 0;
  const unclaimedHot = unclaimed.length > 0;
  const asideOpen = stuckOpen || unclaimedOpen;

  // Funnel cards represent relationships — deep-link to the relationship
  // record when the contact anchors one, else fall back to the contact peek.
  const openEntity = (c: { id: string; relationship_id?: string | null }) => {
    if (c.relationship_id) {
      navigate({ to: "/relationships/$id", params: { id: c.relationship_id } });
    } else {
      setDetailId(c.id);
    }
  };

  return (
    <div className="px-4 md:px-8 py-8 max-w-[1400px] mx-auto">
      <header className="mb-8 flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">The Funnel</div>
          <h1 className="text-4xl md:text-5xl font-medium tracking-tight" style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}>
            Relationships, brewing.
          </h1>
          <p className="text-muted-foreground mt-2 max-w-lg">
            Do the work. Crema handles the CRM. Finish a stage's required tasks and the relationship drips down on its own.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUnclaimedOpen((s) => !s)}
            aria-expanded={unclaimedOpen}
            aria-label={`${unclaimedOpen ? "Hide" : "Show"} unclaimed leads panel`}
            className={`relative inline-flex items-center gap-3 rounded-full border px-4 py-2 transition-all ${
              unclaimedHot
                ? "border-[#c9885a]/40 bg-[#c9885a]/10 hover:bg-[#c9885a]/20"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            {unclaimedHot && (
              <span className="absolute inset-0 -z-10 rounded-full bg-[#c9885a]/25 animate-ping pointer-events-none" />
            )}
            <UserPlus className={`size-4 ${unclaimedHot ? "text-[#7a4a2b]" : "text-muted-foreground"}`} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Unclaimed</span>
            <span className={`text-2xl tabular-nums font-semibold ${unclaimedHot ? "text-[#3b2418]" : ""}`}>{unclaimed.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setStuckOpen((s) => !s)}
            aria-expanded={stuckOpen}
            aria-label={`${stuckOpen ? "Hide" : "Show"} stuck panel`}
            className={`relative inline-flex items-center gap-3 rounded-full border px-4 py-2 transition-all ${
              stuckHot
                ? "border-destructive/40 bg-destructive/5 hover:bg-destructive/10 animate-stuck-pulse"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            {stuckHot && (
              <span className="absolute inset-0 -z-10 rounded-full bg-destructive/20 animate-ping pointer-events-none" />
            )}
            <Flame className={`size-4 ${stuckHot ? "text-destructive" : "text-muted-foreground"}`} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Stuck</span>
            <span className={`text-2xl tabular-nums font-semibold ${stuckHot ? "text-destructive" : ""}`}>{stuck.length}</span>
          </button>
        </div>
      </header>

      <div className={`grid gap-6 ${asideOpen ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]" : "grid-cols-1"}`}>
        <div className="space-y-4 min-w-0">
          {STAGES.map((s, idx) => {
            const contacts = (data?.grouped[s.key] ?? []) as any[];
            return (
              <FunnelBand
                key={s.key}
                stage={s}
                contacts={contacts}
                onToggle={(id, completed) => toggle.mutate({ id, completed })}
                onArchive={(id) => archive.mutate(id)}
                onAdvance={(id) => {
                  const next = NEXT_STAGE[s.key];
                  if (next) advance.mutate({ contactId: id, toStage: next });
                }}
                onOpenContact={openEntity}
                advancePendingId={advance.isPending ? advance.variables?.contactId : undefined}
                onAuto={s.key === "customer" ? undefined : () => auto.mutate(s.key as "lead" | "contact" | "deal")}
                autoPending={auto.isPending && auto.variables === s.key}
                isLast={idx === STAGES.length - 1}
              />
            );
          })}
        </div>

        <AnimatePresence>
          {asideOpen && (
            <motion.aside
              key="funnel-aside"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              className="min-w-0 lg:sticky lg:top-16 lg:self-start space-y-4"
            >
              {unclaimedOpen && (
                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="size-6 rounded-md bg-[#c9885a]/15 text-[#7a4a2b] flex items-center justify-center"><UserPlus className="size-3.5" /></div>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Unclaimed leads</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUnclaimedOpen(false)}
                      aria-label="Collapse unclaimed panel"
                      className="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  {unclaimed.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing inbound waiting. Tracker's quiet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {unclaimed.slice(0, 12).map((c: any) => (
                        <li key={c.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted">
                          <button
                            type="button"
                            onClick={() => openEntity(c)}
                            className="block min-w-0 flex-1 text-left"
                          >
                            <div className="text-sm font-medium truncate">{c.full_name}</div>
                            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground truncate">
                              {c.company?.name ?? c.email ?? "no company"} · {formatDistanceToNow(new Date(c.created_at.includes("T") ? c.created_at : `${c.created_at.replace(" ", "T")}Z`), { addSuffix: true })}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => claim.mutate(c.id)}
                            disabled={claim.isPending && claim.variables === c.id}
                            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[#c9885a]/40 bg-[#c9885a]/10 px-2.5 py-1 text-xs font-medium text-[#3b2418] hover:bg-[#c9885a]/25 hover:border-[#c9885a] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {claim.isPending && claim.variables === c.id ? "Claiming…" : "Claim"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {stuckOpen && (
                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="size-6 rounded-md bg-destructive/10 text-destructive flex items-center justify-center"><Flame className="size-3.5" /></div>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Stuck &gt; 7 days</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStuckOpen(false)}
                      aria-label="Collapse stuck panel"
                      className="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  {stuck.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing's burnt. Everything's flowing.</p>
                  ) : (
                    <ul className="space-y-2">
                      {stuck.slice(0, 8).map((c: any) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => openEntity(c)}
                            className="block w-full text-left p-2 rounded-md hover:bg-muted"
                          >
                            <div className="text-sm font-medium truncate">{c.full_name}</div>
                            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                              {c.relationship_stage} · {c.daysInStage}d in stage
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      <ContactDetailModal
        contactId={detailId}
        open={detailId !== null}
        onOpenChange={(o) => {
          if (!o) setDetailId(null);
        }}
      />
    </div>
  );
}

function FunnelBand({ stage, contacts, onToggle, onArchive, onAdvance, onOpenContact, advancePendingId, onAuto, autoPending, isLast }: { stage: typeof STAGES[number]; contacts: any[]; onToggle: (id: string, completed: boolean) => void; onArchive: (id: string) => void; onAdvance: (id: string) => void; onOpenContact: (contact: any) => void; advancePendingId?: string; onAuto?: () => void; autoPending?: boolean; isLast: boolean }) {
  const Icon = stage.icon;
  const isCustomer = stage.key === "customer";
  const canAuto = Boolean(onAuto) && contacts.some((c) => c.total > 0 && c.done < c.total);
  return (
    <motion.section
      layout
      className="relative overflow-hidden rounded-2xl border border-border"
      style={{ background: STAGE_TINTS[stage.key] }}
    >
      <div className="px-6 py-5 flex items-center justify-between gap-3 flex-wrap" style={{ width: `${stage.widthPct}%`, marginLeft: `${(100 - stage.widthPct) / 2}%` }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${isCustomer ? "bg-white/15 text-white" : "bg-background/60 text-foreground"}`}>
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <div className={`text-3xl md:text-4xl font-medium tracking-tight truncate ${isCustomer ? "text-white" : ""}`} style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}>
              {stage.label}
            </div>
            <div className={`font-mono text-[10px] uppercase tracking-widest truncate ${isCustomer ? "text-white/70" : "text-muted-foreground"}`}>
              {stage.copy(contacts.length)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {onAuto && (
            <button
              onClick={onAuto}
              disabled={!canAuto || autoPending}
              className="group inline-flex items-center gap-2 rounded-full border border-[#c9885a]/40 bg-[#c9885a]/10 px-3.5 py-1.5 text-xs font-medium text-[#3b2418] hover:bg-[#c9885a]/25 hover:border-[#c9885a] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              title="Tick the next required task on every card in this stage"
            >
              <Wand2 className={`size-3.5 ${autoPending ? "animate-pulse" : "group-hover:rotate-12 transition-transform"}`} />
              {autoPending ? "Brewing…" : "Brew next step"}
            </button>
          )}
          <div className={`text-4xl md:text-5xl font-medium tabular-nums ${isCustomer ? "text-white" : "text-foreground"}`} style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}>
            {contacts.length}
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 overflow-x-auto" style={{ width: `${stage.widthPct}%`, marginLeft: `${(100 - stage.widthPct) / 2}%` }}>
        {contacts.length === 0 ? (
          <div className={`text-sm py-6 italic ${isCustomer ? "text-white/70" : "text-muted-foreground"}`}>No one here yet.</div>
        ) : (
          <div className="flex gap-3 pb-2">
            <AnimatePresence mode="popLayout">
              {contacts.map((c) => (
                <RelationshipCard
                  key={c.id}
                  contact={c}
                  onToggle={onToggle}
                  onArchive={onArchive}
                  onAdvance={isCustomer ? undefined : () => onAdvance(c.id)}
                  onOpen={onOpenContact}
                  nextLabel={isCustomer ? null : STAGE_LABEL[NEXT_STAGE[stage.key]!]}
                  advancePending={advancePendingId === c.id}
                  dark={isCustomer}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {!isLast && (
        <div className="absolute left-1/2 -bottom-3 -translate-x-1/2 z-10">
          <ArrowRight className="size-5 rotate-90 text-muted-foreground" />
        </div>
      )}
    </motion.section>
  );
}

function RelationshipCard({ contact, onToggle, onArchive, onAdvance, onOpen, nextLabel, advancePending, dark }: { contact: any; onToggle: (id: string, completed: boolean) => void; onArchive: (id: string) => void; onAdvance?: () => void; onOpen: (contact: any) => void; nextLabel: string | null; advancePending?: boolean; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const cardBase = dark ? "bg-white/10 border-white/20 text-white" : "bg-background border-border";
  const subText = dark ? "text-white/70" : "text-muted-foreground";
  const canAdvance = Boolean(onAdvance) && !advancePending;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <motion.div
      layoutId={`card-${contact.id}`}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={canAdvance ? onAdvance : undefined}
      role={canAdvance ? "button" : undefined}
      tabIndex={canAdvance ? 0 : undefined}
      aria-label={canAdvance && nextLabel ? `Move ${contact.full_name} to ${nextLabel}` : undefined}
      onKeyDown={canAdvance ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAdvance!(); } } : undefined}
      className={`relative shrink-0 w-64 rounded-xl border p-4 ${cardBase} ${canAdvance ? "cursor-pointer" : ""} ${advancePending ? "opacity-60" : ""}`}
      style={{ boxShadow: open ? "0 12px 30px -12px rgba(59,36,24,0.35)" : undefined, transform: open ? "translateY(-2px)" : undefined, transition: "transform .2s, box-shadow .2s" }}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpen(contact); }}
          className="block min-w-0 flex-1 hover:underline text-left"
        >
          <div className="font-semibold truncate">{contact.full_name}</div>
          <div className={`font-mono text-[10px] uppercase tracking-widest ${subText} truncate`}>
            {contact.company?.name ?? "no company"} · {contact.daysInStage}d
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0" onClick={stop}>
          {contact.owner && <OwnerChip owner={contact.owner} dark={dark} />}
          {contact.total > 0 && <ProgressRing done={contact.done} total={contact.total} dark={dark} />}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                title="Disqualify"
                className={`size-7 rounded-md flex items-center justify-center transition-colors ${
                  dark
                    ? "text-white/60 hover:text-white hover:bg-white/15"
                    : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                }`}
              >
                <Archive className="size-3.5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent onClick={stop}>
              <AlertDialogHeader>
                <AlertDialogTitle>Disqualify {contact.full_name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This archives the relationship and removes it from the funnel. You can find it again under archived records.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onArchive(contact.id)}>Disqualify</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {contact.total > 0 && (
        <AnimatePresence>
          {open && (
            <motion.ul
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={`mt-3 pt-3 border-t ${dark ? "border-white/20" : "border-border"} space-y-1.5`}
            >
              {contact.checklist.map((item: any) => (
                <li key={item.key} className="flex items-center gap-2 text-sm">
                  <button
                    type="button"
                    disabled={!item.taskId}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (item.taskId) onToggle(item.taskId, !item.completed);
                    }}
                    className={`size-4 rounded border flex items-center justify-center transition-all ${
                      item.completed
                        ? "bg-[#c9885a] border-[#c9885a] text-white scale-105"
                        : dark ? "border-white/40" : "border-border"
                    } ${!item.taskId ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    {item.completed && <Check className="size-3" strokeWidth={3} />}
                  </button>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.taskId) onToggle(item.taskId, !item.completed);
                    }}
                    className={`${item.completed ? `${subText} line-through` : ""} ${item.taskId ? "cursor-pointer select-none" : ""}`}
                  >
                    {item.title}
                  </span>
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      )}

      {canAdvance && open && nextLabel && (
        <div className={`mt-2 flex items-center justify-end gap-1 font-mono text-[10px] uppercase tracking-widest ${subText}`}>
          <span>Click to move to {nextLabel}</span>
          <ArrowRight className="size-3" />
        </div>
      )}
    </motion.div>
  );
}

function OwnerChip({ owner, dark }: { owner: { full_name: string | null; avatar_url: string | null }; dark?: boolean }) {
  const initial = (owner.full_name ?? "?").trim().charAt(0).toUpperCase() || "?";
  const base = dark
    ? "bg-white/15 text-white border-white/20"
    : "bg-muted text-muted-foreground border-border";
  return (
    <div
      title={owner.full_name ?? "Owner"}
      className={`size-7 rounded-full border flex items-center justify-center text-[10px] font-semibold overflow-hidden ${base}`}
    >
      {owner.avatar_url ? (
        <img src={owner.avatar_url} alt="" className="size-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

function ProgressRing({ done, total, dark }: { done: number; total: number; dark?: boolean }) {
  const pct = total === 0 ? 0 : done / total;
  const r = 14;
  const c = 2 * Math.PI * r;
  const track = dark ? "rgba(255,255,255,0.25)" : "var(--border)";
  const fill = dark ? "#fff" : "#c9885a";
  return (
    <div className="relative size-9 shrink-0">
      <svg viewBox="0 0 36 36" className="size-9 -rotate-90">
        <circle cx="18" cy="18" r={r} stroke={track} strokeWidth="3" fill="none" />
        <circle cx="18" cy="18" r={r} stroke={fill} strokeWidth="3" fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .4s ease" }} />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center text-[10px] font-mono tabular-nums ${dark ? "text-white" : "text-foreground"}`}>
        {done}/{total}
      </div>
    </div>
  );
}
