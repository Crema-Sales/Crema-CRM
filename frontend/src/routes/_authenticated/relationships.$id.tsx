import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft, Mail, Phone, Calendar, FileText, Zap, Pin,
  Trash2, Archive, Plus, Send, X,
} from "lucide-react";
import { usePeek } from "@/components/peek/peek-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  getRelationship,
  updateRelationshipCupStatus,
  archiveRelationship,
  deleteRelationship,
  addRelationshipContact,
  removeRelationshipContact,
  addRelationshipCompany,
  removeRelationshipCompany,
  addRelationshipDeal,
  removeRelationshipDeal,
  createAndAddRelationshipDeal,
  createRelationshipNote,
  deleteRelationshipNote,
  logRelationshipActivity,
  listContacts,
  listCompanies,
  listDeals,
  CUP_STATUSES,
  CUP_STATUS_LABELS,
  CUP_STATUS_NUMBER,
  type CupStatus,
} from "@/lib/crm.functions";

export const Route = createFileRoute("/_authenticated/relationships/$id")({
  component: RelationshipDetailPage,
});

// ─── helpers ───────────────────────────────────────────────────────────────

const ACTIVITY_ICON: Record<string, any> = {
  email: Mail, call: Phone, meeting: Calendar,
  note: FileText, signal: Zap, system: FileText,
};

function fmtUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n) || 0);
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

const AVATAR_PALETTE = [
  "bg-[#c9885a]/20 text-[#7a4a28]",
  "bg-orange-100 text-orange-800",
  "bg-amber-100 text-amber-800",
  "bg-stone-200 text-stone-700",
  "bg-[#3b2418]/10 text-[#3b2418]",
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

// ─── Cup SVG graphic ───────────────────────────────────────────────────────

function CupGraphic({ status }: { status: CupStatus }) {
  const n = CUP_STATUS_NUMBER[status] ?? 0;
  // customer = full (9/9); new/stale = empty (0/9)
  const fill = n === 9 ? 1 : n / 9;
  const carafeH = 78;
  const fillH = Math.round(carafeH * fill);
  const fillY = 190 - fillH;
  const label = n === 0 ? "0 cups" : n === 9 ? "full cup" : `${n} cup${n !== 1 ? "s" : ""}`;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="font-mono text-[10px] uppercase tracking-widest text-[#c9885a]">
        {label}
      </span>
      <svg viewBox="0 0 140 210" width={130} height={195} aria-label={`${label} — ${CUP_STATUS_LABELS[status]}`}>
        {/* clip path for carafe fill */}
        <defs>
          <clipPath id="carafe-clip">
            <path d="M32 108 Q28 150 30 185 Q34 198 70 198 Q106 198 110 185 Q112 150 108 108 Z" />
          </clipPath>
        </defs>

        {/* filter / dripper cone */}
        <path d="M20 18 L120 18 L92 88 Q70 98 48 88 Z"
          fill="none" stroke="#c9885a" strokeWidth="2.5" strokeLinejoin="round" />
        {/* filter ridges */}
        <line x1="36" y1="48" x2="104" y2="48" stroke="#c9885a" strokeWidth="1" opacity="0.4" />
        <line x1="42" y1="68" x2="98" y2="68" stroke="#c9885a" strokeWidth="1" opacity="0.4" />
        {/* center line of filter */}
        <line x1="70" y1="18" x2="70" y2="88" stroke="#c9885a" strokeWidth="1" opacity="0.3" />
        {/* flat top rim */}
        <line x1="16" y1="18" x2="124" y2="18" stroke="#c9885a" strokeWidth="3" strokeLinecap="round" />

        {/* neck */}
        <rect x="62" y="88" width="16" height="20" rx="2"
          fill="none" stroke="#c9885a" strokeWidth="2" />

        {/* carafe body outline */}
        <path d="M32 108 Q28 150 30 185 Q34 198 70 198 Q106 198 110 185 Q112 150 108 108 Z"
          fill="none" stroke="#c9885a" strokeWidth="2.5" />

        {/* coffee fill */}
        {fillH > 0 && (
          <rect
            x="28" y={fillY} width="84" height={fillH + 10}
            fill="#3b2418"
            clipPath="url(#carafe-clip)"
            opacity="0.85"
          />
        )}

        {/* handle */}
        <path d="M110 128 Q130 128 130 148 Q130 168 110 168"
          fill="none" stroke="#c9885a" strokeWidth="2.5" strokeLinecap="round" />

        {/* coffee drop falling from neck (decorative) */}
        {fill < 1 && (
          <ellipse cx="70" cy="112" rx="2" ry="3" fill="#3b2418" opacity="0.5" />
        )}
      </svg>
    </div>
  );
}

// ─── Add Note Modal ────────────────────────────────────────────────────────

function AddNoteModal({
  open, onClose, relationshipId, onSuccess,
}: { open: boolean; onClose: () => void; relationshipId: string; onSuccess: () => void }) {
  const fn = useServerFn(createRelationshipNote);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      await fn({ data: { relationshipId, title: title || undefined, body: body.trim(), pinned } });
      toast.success("Note added");
      setTitle(""); setBody(""); setPinned(false);
      onSuccess();
      onClose();
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}>
            Add note
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Note title…" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your note…"
              rows={5}
              maxLength={10000}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="rounded" />
            Pin this note
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !body.trim()}>
              {saving ? "Saving…" : "Save note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Contact Modal ─────────────────────────────────────────────────────

function AddContactModal({
  open, onClose, relationshipId, linkedContactIds, role, onSuccess,
}: {
  open: boolean; onClose: () => void; relationshipId: string;
  linkedContactIds: string[]; role: "primary" | "secondary"; onSuccess: () => void;
}) {
  const listFn = useServerFn(listContacts);
  const addFn = useServerFn(addRelationshipContact);
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-list"],
    queryFn: () => listFn(),
    enabled: open,
  });
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const available = (contacts as any[]).filter(
    (c) => !linkedContactIds.includes(c.id) &&
      (c.full_name.toLowerCase().includes(q.toLowerCase()) ||
        (c.email ?? "").toLowerCase().includes(q.toLowerCase())),
  );

  async function pick(contactId: string) {
    setSaving(true);
    try {
      await addFn({ data: { relationshipId, contactId, role } });
      toast.success("Contact linked");
      onSuccess();
      onClose();
    } catch {
      toast.error("Failed to link contact");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}>
            Add {role} contact
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search contacts…"
            autoFocus
          />
          <ul className="space-y-1 max-h-64 overflow-y-auto">
            {available.map((c: any) => (
              <li key={c.id}>
                <button
                  onClick={() => pick(c.id)}
                  disabled={saving}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <p className="text-sm font-medium">{c.full_name}</p>
                  {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                </button>
              </li>
            ))}
            {available.length === 0 && (
              <li className="text-sm text-muted-foreground text-center py-6">No contacts found.</li>
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Company Modal ─────────────────────────────────────────────────────

function AddCompanyModal({
  open, onClose, relationshipId, linkedCompanyIds, role, onSuccess,
}: {
  open: boolean; onClose: () => void; relationshipId: string;
  linkedCompanyIds: string[]; role: "primary" | "secondary"; onSuccess: () => void;
}) {
  const listFn = useServerFn(listCompanies);
  const addFn = useServerFn(addRelationshipCompany);
  const { data: companies = [] } = useQuery({
    queryKey: ["companies-list"],
    queryFn: () => listFn(),
    enabled: open,
  });
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  const available = (companies as any[]).filter(
    (c) => !linkedCompanyIds.includes(c.id) &&
      c.name.toLowerCase().includes(q.toLowerCase()),
  );

  async function pick(companyId: string) {
    setSaving(true);
    try {
      await addFn({ data: { relationshipId, companyId, role } });
      toast.success("Company linked");
      onSuccess();
      onClose();
    } catch {
      toast.error("Failed to link company");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}>
            Add {role} company
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies…" autoFocus />
          <ul className="space-y-1 max-h-64 overflow-y-auto">
            {available.map((c: any) => (
              <li key={c.id}>
                <button
                  onClick={() => pick(c.id)}
                  disabled={saving}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <p className="text-sm font-medium">{c.name}</p>
                  {c.domain && <p className="text-xs text-muted-foreground">{c.domain}</p>}
                </button>
              </li>
            ))}
            {available.length === 0 && (
              <li className="text-sm text-muted-foreground text-center py-6">No companies found.</li>
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Deal Modal ────────────────────────────────────────────────────────

function AddDealModal({
  open, onClose, relationshipId, linkedDealIds, role, onSuccess,
}: {
  open: boolean; onClose: () => void; relationshipId: string;
  linkedDealIds: string[]; role: "primary" | "secondary"; onSuccess: () => void;
}) {
  const listFn = useServerFn(listDeals);
  const addExistingFn = useServerFn(addRelationshipDeal);
  const createFn = useServerFn(createAndAddRelationshipDeal);
  const [tab, setTab] = useState<"existing" | "new">("new");
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: deals = [] } = useQuery({
    queryKey: ["deals-list"],
    queryFn: () => listFn(),
    enabled: open && tab === "existing",
  });

  const available = (deals as any[]).filter(
    (d) => !linkedDealIds.includes(d.id) && d.name.toLowerCase().includes(q.toLowerCase()),
  );

  async function pickExisting(dealId: string) {
    setSaving(true);
    try {
      await addExistingFn({ data: { relationshipId, dealId, role } });
      toast.success("Deal linked");
      onSuccess(); onClose();
    } catch { toast.error("Failed to link deal"); }
    finally { setSaving(false); }
  }

  async function createNew(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createFn({ data: { relationshipId, name: name.trim(), value: parseFloat(value) || 0, role } });
      toast.success("Deal created and linked");
      setName(""); setValue("");
      onSuccess(); onClose();
    } catch { toast.error("Failed to create deal"); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}>
            Add {role} deal
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 mb-4">
          {(["new", "existing"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`h-8 px-4 rounded-lg text-xs font-mono uppercase tracking-widest transition-all border ${
                tab === t
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/40"
              }`}
            >
              {t === "new" ? "Create new" : "Link existing"}
            </button>
          ))}
        </div>
        {tab === "new" ? (
          <form onSubmit={createNew} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Deal name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website Build" required />
            </div>
            <div className="space-y-1.5">
              <Label>Value ($)</Label>
              <Input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving ? "Creating…" : "Create deal"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-3">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search deals…" autoFocus />
            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {available.map((d: any) => (
                <li key={d.id}>
                  <button
                    onClick={() => pickExisting(d.id)}
                    disabled={saving}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <p className="text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{fmtUsd(d.value)} · {d.stage}</p>
                  </button>
                </li>
              ))}
              {available.length === 0 && (
                <li className="text-sm text-muted-foreground text-center py-6">No deals found.</li>
              )}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── View Note Modal ───────────────────────────────────────────────────────

function ViewNoteModal({
  note, onClose, onDeleted,
}: { note: any | null; onClose: () => void; onDeleted: () => void }) {
  const deleteFn = useServerFn(deleteRelationshipNote);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!note) return;
    setDeleting(true);
    try {
      await deleteFn({ data: { id: note.id } });
      toast.success("Note deleted");
      onDeleted();
      onClose();
    } catch {
      toast.error("Failed to delete note");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={!!note} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}>
            {note?.title || "Note"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm whitespace-pre-wrap text-muted-foreground min-h-[60px]">{note?.body}</p>
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {note?.created_at ? format(new Date(note.created_at), "MMM d, yyyy · h:mm a") : ""}
        </p>
        <DialogFooter>
          <Button
            type="button" variant="destructive" size="sm"
            onClick={handleDelete} disabled={deleting}
          >
            <Trash2 className="size-3.5 mr-1.5" />
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

function RelationshipDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { peek } = usePeek();

  const getFn = useServerFn(getRelationship);
  const updateStatusFn = useServerFn(updateRelationshipCupStatus);
  const archiveFn = useServerFn(archiveRelationship);
  const deleteFn = useServerFn(deleteRelationship);
  const removeContactFn = useServerFn(removeRelationshipContact);
  const removeCompanyFn = useServerFn(removeRelationshipCompany);
  const removeDealFn = useServerFn(removeRelationshipDeal);
  const logActivityFn = useServerFn(logRelationshipActivity);

  // Modals
  const [noteModal, setNoteModal] = useState(false);
  const [viewNote, setViewNote] = useState<any>(null);
  const [archiveModal, setArchiveModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [addContactModal, setAddContactModal] = useState<"primary" | "secondary" | null>(null);
  const [addCompanyModal, setAddCompanyModal] = useState<"primary" | "secondary" | null>(null);
  const [addDealModal, setAddDealModal] = useState<"primary" | "secondary" | null>(null);

  // Activity input
  const [activityText, setActivityText] = useState("");
  const [sendingActivity, setSendingActivity] = useState(false);
  const activityEndRef = useRef<HTMLDivElement>(null);

  const { data: rel, isLoading } = useQuery({
    queryKey: ["relationship", id],
    queryFn: () => getFn({ data: { id } }),
    refetchInterval: 5_000,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["relationship", id] });
  }

  const statusMut = useMutation({
    mutationFn: (cupStatus: CupStatus) =>
      updateStatusFn({ data: { id, cupStatus } }),
    onSuccess: () => { invalidate(); toast.success("Status updated"); },
    onError: () => toast.error("Failed to update status"),
  });

  const archiveMut = useMutation({
    mutationFn: () => archiveFn({ data: { id: id! } }),
    onSuccess: () => { toast.success("Relationship archived"); navigate({ to: "/relationships" }); },
    onError: () => toast.error("Failed to archive"),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { id: id! } }),
    onSuccess: () => { toast.success("Relationship deleted"); navigate({ to: "/relationships" }); },
    onError: () => toast.error("Failed to delete"),
  });

  async function sendActivity(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!activityText.trim() || !id) return;
    setSendingActivity(true);
    try {
      await logActivityFn({ data: { relationshipId: id, subject: activityText.trim() } });
      setActivityText("");
      invalidate();
    } catch {
      toast.error("Failed to add activity");
    } finally {
      setSendingActivity(false);
    }
  }

  if (isLoading || !rel) return (
    <div className="px-6 py-10 text-sm text-muted-foreground">Loading…</div>
  );

  const contacts: any[] = rel.contacts ?? [];
  const companies: any[] = rel.companies ?? [];
  const deals: any[] = rel.deals ?? [];
  const notes: any[] = rel.notes ?? [];
  const activities: any[] = rel.activities ?? [];

  const primaryContact = contacts.find((c) => c.role === "primary");
  const secondaryContact = contacts.find((c) => c.role === "secondary");
  const primaryCompany = companies.find((c) => c.role === "primary");
  const secondaryCompany = companies.find((c) => c.role === "secondary");
  const primaryDeal = deals.find((d) => d.role === "primary");
  const secondaryDeal = deals.find((d) => d.role === "secondary");

  const cupStatus: CupStatus = (rel.status as CupStatus) ?? "new";

  return (
    <div className="py-8 px-4 md:px-8 max-w-[1400px] mx-auto space-y-6">
      {/* Back nav */}
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <a href="/relationships">
          <ArrowLeft className="size-3.5 mr-1" />
          All relationships
        </a>
      </Button>

      {/* Main card */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px]">

          {/* ── Left panel ──────────────────────────────────── */}
          <div className="border-b lg:border-b-0 lg:border-r border-border/60 p-6 space-y-6">

            {/* Primary contact */}
            <section>
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#c9885a] mb-3">
                Primary Contact
              </p>
              {primaryContact ? (
                <div className="rounded-xl border border-border/60 bg-background p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className={`size-12 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarColor(primaryContact.full_name)}`}>
                      {initials(primaryContact.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => peek("contact", primaryContact.id)}
                        className="font-medium truncate leading-tight text-left hover:text-[#c9885a] transition-colors"
                        style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}>
                        {primaryContact.full_name}
                      </button>
                      {primaryContact.title && (
                        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">
                          {primaryContact.title}
                        </p>
                      )}
                      {primaryContact.company?.name && (
                        <p className="text-xs text-muted-foreground">{primaryContact.company.name}</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeContactFn({ data: { relationshipId: id, contactId: primaryContact.id } }).then(invalidate)}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                      title="Remove contact"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  {(primaryContact.email || primaryContact.phone) && (
                    <div className="flex flex-col gap-1">
                      {primaryContact.email && (
                        <a href={`mailto:${primaryContact.email}`}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <Mail className="size-3" />
                          <span className="truncate">{primaryContact.email}</span>
                        </a>
                      )}
                      {primaryContact.phone && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="size-3" />
                          {primaryContact.phone}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No primary contact</p>
              )}

              {/* Secondary contact */}
              {secondaryContact ? (
                <div className="mt-3 rounded-xl border border-border/60 bg-background/60 p-3 space-y-2">
                  <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">Secondary</p>
                  <div className="flex items-center gap-2">
                    <div className={`size-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${avatarColor(secondaryContact.full_name)}`}>
                      {initials(secondaryContact.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => peek("contact", secondaryContact.id)}
                        className="text-sm font-medium truncate text-left hover:text-[#c9885a] transition-colors"
                      >
                        {secondaryContact.full_name}
                      </button>
                      {secondaryContact.title && (
                        <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">{secondaryContact.title}</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeContactFn({ data: { relationshipId: id, contactId: secondaryContact.id } }).then(invalidate)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddContactModal(primaryContact ? "secondary" : "primary")}
                  className="mt-3 w-full text-left text-xs text-[#c9885a] hover:text-[#7a4a28] transition-colors flex items-center gap-1.5 py-1"
                >
                  <Plus className="size-3" />
                  {primaryContact ? "+ Add secondary contact" : "+ Add contact"}
                </button>
              )}

            </section>

            {/* Company */}
            <section>
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#c9885a] mb-3">Company</p>
              {primaryCompany ? (
                <div className="rounded-xl border border-border/60 bg-background p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <button
                        type="button"
                        onClick={() => peek("company", primaryCompany.id)}
                        className="font-medium leading-tight text-left hover:text-[#c9885a] transition-colors"
                        style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}>
                        {primaryCompany.name}
                      </button>
                      {primaryCompany.domain && (
                        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">
                          {primaryCompany.domain}
                        </p>
                      )}
                      {primaryCompany.industry && (
                        <p className="text-xs text-muted-foreground mt-1">{primaryCompany.industry}</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeCompanyFn({ data: { relationshipId: id, companyId: primaryCompany.id } }).then(invalidate)}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No company</p>
              )}

              {secondaryCompany ? (
                <div className="mt-3 rounded-xl border border-border/60 bg-background/60 p-3">
                  <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-1">Secondary</p>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <button
                        type="button"
                        onClick={() => peek("company", secondaryCompany.id)}
                        className="text-sm font-medium text-left hover:text-[#c9885a] transition-colors"
                      >
                        {secondaryCompany.name}
                      </button>
                      {secondaryCompany.domain && (
                        <p className="text-xs text-muted-foreground">{secondaryCompany.domain}</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeCompanyFn({ data: { relationshipId: id, companyId: secondaryCompany.id } }).then(invalidate)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddCompanyModal(primaryCompany ? "secondary" : "primary")}
                  className="mt-3 w-full text-left text-xs text-[#c9885a] hover:text-[#7a4a28] transition-colors flex items-center gap-1.5 py-1"
                >
                  <Plus className="size-3" />
                  {primaryCompany ? "+ Add secondary company" : "+ Add company"}
                </button>
              )}
            </section>

            {/* Notes */}
            <section>
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#c9885a] mb-3">Notes</p>
              {notes.length > 0 ? (
                <ul className="space-y-1.5 mb-3">
                  {notes.map((n) => (
                    <li key={n.id}>
                      <button
                        onClick={() => setViewNote(n)}
                        className="w-full text-left flex items-center gap-2 text-sm hover:text-foreground text-muted-foreground transition-colors group"
                      >
                        {n.pinned ? <Pin className="size-3 text-[#c9885a] shrink-0" /> : <FileText className="size-3 shrink-0" />}
                        <span className="truncate">{n.title || n.body.slice(0, 40)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground italic mb-3">No notes yet.</p>
              )}
              <button
                onClick={() => setNoteModal(true)}
                className="text-xs text-[#c9885a] hover:text-[#7a4a28] transition-colors flex items-center gap-1.5"
              >
                <Plus className="size-3" />
                + Add note
              </button>
            </section>

            {/* Actions */}
            <section>
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#c9885a] mb-3">Actions</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setArchiveModal(true)}
                  className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Archive className="size-4" />
                  Archive
                </button>
                <button
                  onClick={() => setDeleteModal(true)}
                  className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="size-4" />
                  Delete
                </button>
              </div>
            </section>
          </div>

          {/* ── Center panel: Activity ───────────────────────── */}
          <div className="border-b lg:border-b-0 lg:border-r border-border/60 p-6 flex flex-col gap-5">
            <div>
              <h2
                className="text-3xl font-medium"
                style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
              >
                Activity
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                What would you like to add to the activity feed?
              </p>
            </div>

            {/* Chat input */}
            <form onSubmit={sendActivity} className="flex gap-2">
              <Input
                value={activityText}
                onChange={(e) => setActivityText(e.target.value)}
                placeholder="Add a note, call log, or update…"
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={sendingActivity || !activityText.trim()}
                className="bg-[#3b2418] hover:bg-[#2a1a10] text-white shrink-0"
              >
                <Send className="size-4" />
              </Button>
            </form>

            {/* Timeline */}
            <div className="flex-1 overflow-y-auto space-y-0">
              {activities.map((a: any, i: number) => {
                const Icon = ACTIVITY_ICON[a.type] ?? FileText;
                const isLast = i === activities.length - 1;
                return (
                  <div key={a.id} className="flex gap-3 pb-4 relative">
                    {/* vertical connector */}
                    {!isLast && (
                      <div className="absolute left-[18px] top-7 bottom-0 w-px bg-border/60" />
                    )}
                    <div className="size-9 rounded-full bg-muted flex items-center justify-center shrink-0 z-10 border border-border/60">
                      <Icon className="size-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1 pt-1.5">
                      <p className="text-sm leading-snug">{a.subject}</p>
                      {a.body && <p className="text-xs text-muted-foreground mt-0.5">{a.body}</p>}
                      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-1 block">
                        {a.type} · {formatDistanceToNow(new Date(a.occurred_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                );
              })}
              {activities.length === 0 && (
                <p className="text-sm text-muted-foreground italic text-center py-8">
                  No activity yet — add the first entry above.
                </p>
              )}
              <div ref={activityEndRef} />
            </div>
          </div>

          {/* ── Right panel: Cup + Status + Deals ───────────── */}
          <div className="p-6 flex flex-col gap-6">
            {/* Cup graphic */}
            <div className="flex justify-center pt-2">
              <CupGraphic status={cupStatus} />
            </div>

            {/* Status */}
            <section>
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#c9885a] mb-2">Status</p>
              <Select
                value={cupStatus}
                onValueChange={(v) => statusMut.mutate(v as CupStatus)}
              >
                <SelectTrigger className="w-full rounded-xl border-border/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUP_STATUSES.map((s) => {
                    const n = CUP_STATUS_NUMBER[s];
                    const prefix = n > 0 && n < 9 ? `${n} cup${n !== 1 ? "s" : ""} — ` : "";
                    return (
                      <SelectItem key={s} value={s}>
                        <span className="font-mono text-xs">
                          {prefix}{CUP_STATUS_LABELS[s]}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </section>

            {/* Deals */}
            <section className="flex-1">
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#c9885a] mb-3">Deal</p>

              {primaryDeal ? (
                <div className="space-y-2">
                  <div className="text-3xl font-semibold text-[#c9885a]" style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}>
                    {fmtUsd(primaryDeal.value)}
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => peek("deal", primaryDeal.id)}
                      className="text-sm truncate text-left hover:text-[#c9885a] transition-colors"
                    >
                      {primaryDeal.name}
                    </button>
                    <button
                      onClick={() => removeDealFn({ data: { relationshipId: id, dealId: primaryDeal.id } }).then(invalidate)}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-2"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No deal linked</p>
              )}

              {secondaryDeal ? (
                <div className="mt-4 space-y-1">
                  <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">Secondary deal</p>
                  <div className="text-xl font-semibold text-muted-foreground">
                    {fmtUsd(secondaryDeal.value)}
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-3 py-2">
                    <button
                      type="button"
                      onClick={() => peek("deal", secondaryDeal.id)}
                      className="text-sm truncate text-left hover:text-[#c9885a] transition-colors"
                    >
                      {secondaryDeal.name}
                    </button>
                    <button
                      onClick={() => removeDealFn({ data: { relationshipId: id, dealId: secondaryDeal.id } }).then(invalidate)}
                      className="text-muted-foreground hover:text-destructive transition-colors ml-2"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddDealModal(primaryDeal ? "secondary" : "primary")}
                  className="mt-3 flex items-center gap-1.5 text-xs rounded-xl border border-border/60 bg-background px-4 py-2.5 w-full hover:border-[#c9885a]/50 transition-colors text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                  {primaryDeal ? "+ Add secondary deal" : "+ Add deal"}
                </button>
              )}

            </section>
          </div>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────── */}

      <AddNoteModal
        open={noteModal}
        onClose={() => setNoteModal(false)}
        relationshipId={id}
        onSuccess={invalidate}
      />

      <ViewNoteModal
        note={viewNote}
        onClose={() => setViewNote(null)}
        onDeleted={invalidate}
      />

      {addContactModal && (
        <AddContactModal
          open
          onClose={() => setAddContactModal(null)}
          relationshipId={id}
          linkedContactIds={contacts.map((c) => c.id)}
          role={addContactModal}
          onSuccess={invalidate}
        />
      )}

      {addCompanyModal && (
        <AddCompanyModal
          open
          onClose={() => setAddCompanyModal(null)}
          relationshipId={id}
          linkedCompanyIds={companies.map((c) => c.id)}
          role={addCompanyModal}
          onSuccess={invalidate}
        />
      )}

      {addDealModal && (
        <AddDealModal
          open
          onClose={() => setAddDealModal(null)}
          relationshipId={id}
          linkedDealIds={deals.map((d) => d.id)}
          role={addDealModal}
          onSuccess={invalidate}
        />
      )}

      <AlertDialog open={archiveModal} onOpenChange={setArchiveModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this relationship?</AlertDialogTitle>
            <AlertDialogDescription>
              The relationship will be hidden from your active list. You can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveMut.mutate()}
              disabled={archiveMut.isPending}
            >
              {archiveMut.isPending ? "Archiving…" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteModal} onOpenChange={setDeleteModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this relationship?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the relationship and all its notes. Linked contacts and deals will not be deleted.
              <br /><br />
              <strong>This cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
