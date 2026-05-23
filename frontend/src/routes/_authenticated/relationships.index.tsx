import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listRelationshipsForFunnel,
  advanceRelationshipStatus,
  createRelationshipRecord,
  createDeal,
  listContacts,
} from "@/lib/crm.functions";
import React, { useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Plus, Check } from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import { formatDistanceToNow } from "date-fns";
import { useRegisterHelp } from "@/hooks/use-help";
import { relationshipsHelpContent } from "@/components/help/content/relationships-help";
import { useRegisterShortcut } from "@/hooks/use-shortcuts";
import { KbdHint } from "@/components/kbd-hint";

export const Route = createFileRoute("/_authenticated/relationships/")({
  component: RelationshipsPage,
});

type FunnelStatus = "new" | "lead" | "discovery" | "budget_confirmed" | "customer" | "stale";

const STATUS_LABEL: Record<FunnelStatus, string> = {
  new: "New",
  lead: "Lead",
  discovery: "Discovery",
  budget_confirmed: "Budget Confirmed",
  customer: "Customer",
  stale: "Stale",
};

const STATUS_COLORS: Record<FunnelStatus, { bg: string; text: string; border: string }> = {
  new: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
  },
  lead: {
    bg: "bg-[#c9885a]/15",
    text: "text-[#7a4a28] dark:text-[#e8a87a]",
    border: "border-[#c9885a]/30",
  },
  discovery: {
    bg: "bg-orange-500/15",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-500/30",
  },
  budget_confirmed: {
    bg: "bg-amber-500/15",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-500/30",
  },
  customer: {
    bg: "bg-[#3b2418]",
    text: "text-[#f5e8dc]",
    border: "border-[#3b2418]",
  },
  stale: {
    bg: "bg-zinc-500/10",
    text: "text-zinc-500",
    border: "border-zinc-500/30",
  },
};

const NEXT_STATUS: Record<FunnelStatus, FunnelStatus | null> = {
  new: "lead",
  lead: "discovery",
  discovery: "budget_confirmed",
  budget_confirmed: "customer",
  customer: null,
  stale: "lead",
};

const AVATAR_PALETTE = [
  "bg-[#c9885a]/20 text-[#7a4a28]",
  "bg-orange-100 text-orange-800",
  "bg-amber-100 text-amber-800",
  "bg-stone-200 text-stone-700",
  "bg-[#3b2418]/10 text-[#3b2418]",
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

type RelationshipRow = {
  id: string;
  name: string | null;
  status: FunnelStatus;
  status_entered_at: string;
  cups: number;
  open_deal_count: number;
  primary_contact: { full_name: string; email: string | null; title: string | null } | null;
  primary_company: { name: string; domain: string | null } | null;
};

function RelationshipCard({
  r,
  onAdvance,
  onCreateDeal,
  busy,
}: {
  r: RelationshipRow;
  onAdvance: (next: FunnelStatus) => void;
  onCreateDeal: () => void;
  busy: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    setTilt({ x: dy * -10, y: dx * 10 });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    setHovered(false);
  }, []);

  const displayName =
    r.name ?? r.primary_contact?.full_name ?? "Untitled relationship";
  const colors = STATUS_COLORS[r.status] ?? STATUS_COLORS.new;
  const avatarCls = avatarColor(displayName);
  const inStatusFor = formatDistanceToNow(new Date(r.status_entered_at));
  const next = NEXT_STATUS[r.status];

  return (
    <Link
      to="/relationships/$id"
      params={{ id: r.id }}
      className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl"
    >
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${hovered ? 1.02 : 1})`,
        transition: hovered ? "transform 0.08s ease-out" : "transform 0.35s ease-out",
        willChange: "transform",
      }}
      className="relative w-full rounded-2xl bg-card border border-border/60 shadow-sm overflow-hidden select-none"
    >
      {/* Sheen overlay */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl z-10"
        style={{
          background: hovered
            ? `radial-gradient(circle at ${50 + tilt.y * 3}% ${50 + tilt.x * 3}%, rgba(255,255,255,0.18) 0%, transparent 65%)`
            : "none",
        }}
      />

      {/* Status badge */}
      <div className="absolute top-3 right-3 z-20">
        <span
          className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}
        >
          {STATUS_LABEL[r.status]}
        </span>
      </div>

      {/* Avatar area */}
      <div className="pt-8 pb-4 px-6 flex flex-col items-center gap-4">
        <div
          className={`w-24 h-24 rounded-full flex items-center justify-center text-2xl font-semibold tracking-tight ${avatarCls} shadow-inner ring-4 ring-background`}
        >
          {initials(displayName)}
        </div>

        <div className="text-center space-y-1 w-full">
          <p
            className="text-xl font-medium leading-tight truncate"
            style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
          >
            {displayName}
          </p>
          {r.primary_contact?.title && (
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground truncate">
              {r.primary_contact.title}
            </p>
          )}
          {r.primary_company?.name && (
            <p className="text-sm text-muted-foreground truncate">
              {r.primary_company.name}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="border-t border-border/60 px-6 py-3 flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {r.cups} cups · {r.open_deal_count} deals
        </span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {inStatusFor}
        </span>
      </div>

      {/* Actions */}
      <div className="relative z-20 border-t border-border/60 px-3 py-2 flex items-center justify-between gap-1">
        {next ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAdvance(next);
            }}
            disabled={busy}
            className="flex-1 font-mono text-[9px] uppercase tracking-widest px-2 py-1 rounded border border-border hover:border-foreground/40 hover:bg-muted/40 disabled:opacity-50"
          >
            → {STATUS_LABEL[next]}
          </button>
        ) : (
          <span className="flex-1 text-center font-mono text-[9px] uppercase tracking-widest text-muted-foreground opacity-50 px-2 py-1">
            terminal
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCreateDeal();
          }}
          disabled={busy}
          className="font-mono text-[9px] uppercase tracking-widest px-2 py-1 rounded border border-border hover:border-foreground/40 hover:bg-muted/40 disabled:opacity-50"
        >
          + Deal
        </button>
      </div>
    </div>
    </Link>
  );
}

function RelationshipsPage() {
  useRegisterHelp(relationshipsHelpContent);

  const fn = useServerFn(listRelationshipsForFunnel);
  const contactsFn = useServerFn(listContacts);
  const advance = useServerFn(advanceRelationshipStatus);
  const createRel = useServerFn(createRelationshipRecord);
  const createDealFn = useServerFn(createDeal);
  const qc = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ["relationships-funnel"],
    queryFn: () => fn(),
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-picker"],
    queryFn: () => contactsFn(),
  });

  const advanceMut = useMutation({
    mutationFn: (input: { id: string; to_status: FunnelStatus }) =>
      advance({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["relationships-funnel"] }),
  });
  const createRelMut = useMutation({
    mutationFn: (initial_contact_id: string) =>
      createRel({ data: { initial_contact_id, status: "new" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["relationships-funnel"] });
      setPickerContactId("");
      setCreateOpen(false);
    },
  });
  const createDealMut = useMutation({
    mutationFn: (input: { relationship_id: string; name: string }) =>
      createDealFn({ data: { name: input.name, value: 0, relationship_id: input.relationship_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["relationships-funnel"] }),
  });

  const [q, setQ] = useState("");
  const [stage, setStage] = useState<"all" | FunnelStatus>("all");
  const [pickerContactId, setPickerContactId] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const filterInputRef = useRef<HTMLInputElement>(null);

  const rows = data as RelationshipRow[];

  const filtered = rows.filter((r) => {
    const haystack = [
      r.name ?? "",
      r.primary_contact?.full_name ?? "",
      r.primary_company?.name ?? "",
    ]
      .join(" ")
      .toLowerCase();
    const matchQ = !q || haystack.includes(q.toLowerCase());
    const matchS = stage === "all" || r.status === stage;
    return matchQ && matchS;
  });

  useRegisterShortcut({
    id: "list-relationships-focus-filter",
    keys: ["/"],
    label: "Focus filter",
    group: "List",
    run: () => filterInputRef.current?.focus(),
  });

  const statuses: ("all" | FunnelStatus)[] = [
    "all",
    "new",
    "lead",
    "discovery",
    "budget_confirmed",
    "customer",
    "stale",
  ];
  const counts = statuses.reduce(
    (acc, s) => {
      acc[s] = s === "all" ? rows.length : rows.filter((r) => r.status === s).length;
      return acc;
    },
    {} as Record<string, number>,
  );

  const mutBusy = advanceMut.isPending || createDealMut.isPending;

  return (
    <div className="py-10 space-y-8">
      {/* Header */}
      <div className="px-4 md:px-10 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Relationships
          </div>
          <h1
            className="text-5xl font-medium tracking-tight"
            style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
          >
            Everyone in the cup.
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            disabled={createRelMut.isPending}
            className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-foreground bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="size-4" />
            New Relationship
          </button>
        </div>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (createRelMut.isPending) return;
          setCreateOpen(open);
          if (!open) setPickerContactId("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Relationship</DialogTitle>
            <DialogDescription>
              Start with the contact who anchors this relationship. Crema will attach their company when one is on file.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Select Contact
            </span>
            <Command
              loop
              className="rounded-md border border-border bg-background"
            >
              <CommandInput placeholder="Type to filter contacts…" autoFocus />
              <CommandList className="max-h-64">
                <CommandEmpty>No contacts match.</CommandEmpty>
                {(contacts as any[]).map((c) => {
                  const selected = pickerContactId === c.id;
                  const company = c.company?.name as string | undefined;
                  return (
                    <CommandItem
                      key={c.id}
                      value={`${c.full_name}${company ? ` ${company}` : ""}`}
                      onSelect={() => setPickerContactId(c.id)}
                    >
                      <Check
                        className={`size-4 ${selected ? "opacity-100" : "opacity-0"}`}
                      />
                      <span>{c.full_name}</span>
                      {company && (
                        <span className="text-muted-foreground">· {company}</span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandList>
            </Command>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setCreateOpen(false);
                setPickerContactId("");
              }}
              disabled={createRelMut.isPending}
              className="h-9 px-3 rounded-md border border-border bg-background text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!pickerContactId) return;
                createRelMut.mutate(pickerContactId);
              }}
              disabled={!pickerContactId || createRelMut.isPending}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-foreground bg-foreground px-3 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="size-4" />
              {createRelMut.isPending ? "Creating..." : "Create Relationship"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Controls */}
      <div className="px-4 md:px-10 space-y-4">
        {/* Search */}
        <div className="relative w-full max-w-2xl">
          <Search className="size-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={filterInputRef}
            type="text"
            className="w-full h-14 pl-12 pr-4 text-base rounded-xl"
            placeholder="Search relationship, contact, or company…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {/* Stage filters */}
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => {
            const active = stage === s;
            const colors = s !== "all" ? STATUS_COLORS[s] : null;
            return (
              <button
                key={s}
                onClick={() => setStage(s)}
                className={`h-11 px-5 rounded-xl border text-sm font-mono uppercase tracking-widest transition-all ${
                  active
                    ? s === "all"
                      ? "bg-foreground text-background border-foreground shadow-sm"
                      : `${colors!.bg} ${colors!.text} ${colors!.border} shadow-sm`
                    : "bg-background text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground"
                }`}
              >
                {s === "all" ? "all" : STATUS_LABEL[s as FunnelStatus]}
                <span className="ml-2 tabular-nums opacity-60">{counts[s]}</span>
              </button>
            );
          })}
        </div>

        {/* Kbd hints */}
        <div className="text-[10px] text-muted-foreground flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <KbdHint keys="/" /> filter
          </span>
        </div>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 px-4 md:px-10 pb-12">
        {filtered.map((r) => {
          const relName =
            r.name ?? r.primary_contact?.full_name ?? "Untitled relationship";
          return (
            <RelationshipCard
              key={r.id}
              r={r}
              busy={mutBusy}
              onAdvance={(next) => advanceMut.mutate({ id: r.id, to_status: next })}
              onCreateDeal={() =>
                createDealMut.mutate({
                  relationship_id: r.id,
                  name: `${relName} — Deal`,
                })
              }
            />
          );
        })}
        {filtered.length === 0 && (
          <div className="w-full py-20 text-center text-muted-foreground text-sm italic">
            No relationships match. Create a new relationship to add one.
          </div>
        )}
      </div>
    </div>
  );
}
