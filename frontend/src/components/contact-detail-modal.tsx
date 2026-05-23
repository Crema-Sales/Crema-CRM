import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  enrichContactNow,
  getContact,
  upsertContact,
  logActivity,
  createContactTask,
  toggleTask,
  deleteTask,
} from "@/lib/crm.functions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Building2,
  Mail,
  Phone,
  Calendar,
  FileText,
  Zap,
  Plus,
  X,
  CheckSquare,
  Square,
  ExternalLink,
  Link as LinkIcon,
  Trash2,
  Save,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const STAGE_COLORS: Record<string, string> = {
  lead: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  contact: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  deal: "bg-[#c9885a]/10 text-[#c9885a] border-[#c9885a]/30",
  customer: "bg-green-500/10 text-green-400 border-green-500/20",
};

const ACTIVITY_ICON: Record<string, any> = {
  email: Mail,
  call: Phone,
  meeting: Calendar,
  note: FileText,
  signal: Zap,
  system: FileText,
  link: LinkIcon,
};

const ACTIVITY_TYPES: Array<{ value: "note" | "call" | "email" | "meeting"; label: string }> = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
];

type Props = {
  contactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ContactDetailModal({ contactId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const getFn = useServerFn(getContact);
  const upsertFn = useServerFn(upsertContact);
  const logFn = useServerFn(logActivity);
  const addTaskFn = useServerFn(createContactTask);
  const toggleFn = useServerFn(toggleTask);
  const deleteTaskFn = useServerFn(deleteTask);
  const enrichFn = useServerFn(enrichContactNow);

  const { data, isLoading } = useQuery({
    queryKey: ["contact", contactId],
    queryFn: () => getFn({ data: { id: contactId! } }),
    enabled: Boolean(contactId) && open,
    refetchInterval: open ? 5_000 : false,
  });

  const c = data?.contact;
  const tasks = (data?.tasks ?? []) as any[];
  const activities = (data?.activities ?? []) as any[];

  const linkRegex = useMemo(() => /\bhttps?:\/\/\S+/i, []);
  const linksShared = useMemo(
    () => activities.filter((a: any) => linkRegex.test(a.body ?? "") || linkRegex.test(a.subject ?? "")),
    [activities, linkRegex],
  );

  // Notes — local draft, save on demand.
  const [notesDraft, setNotesDraft] = useState<string>("");
  const [notesDirty, setNotesDirty] = useState(false);
  useEffect(() => {
    if (c) {
      setNotesDraft(c.notes ?? "");
      setNotesDirty(false);
    }
  }, [c?.id, c?.notes]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["contact", contactId] });
    qc.invalidateQueries({ queryKey: ["contacts"] });
  };

  const saveNotes = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: c!.id,
          full_name: c!.full_name,
          email: c!.email ?? "",
          phone: c!.phone ?? undefined,
          title: c!.title ?? undefined,
          company_id: c!.company_id ?? null,
          notes: notesDraft,
        },
      }),
    onSuccess: () => {
      invalidate();
      setNotesDirty(false);
      toast.success("Notes saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save notes"),
  });

  // Activity log — manual entry.
  const [activityType, setActivityType] = useState<typeof ACTIVITY_TYPES[number]["value"]>("note");
  const [activitySubject, setActivitySubject] = useState("");
  const [activityBody, setActivityBody] = useState("");
  const logMut = useMutation({
    mutationFn: () =>
      logFn({
        data: {
          type: activityType,
          subject: activitySubject || "(untitled)",
          body: activityBody || undefined,
          contact_id: contactId,
        },
      }),
    onSuccess: () => {
      invalidate();
      setActivitySubject("");
      setActivityBody("");
      toast.success("Activity logged");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to log activity"),
  });

  // Quick add link → maps to a note activity tagged with a URL.
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const linkMut = useMutation({
    mutationFn: () =>
      logFn({
        data: {
          type: "note",
          subject: linkLabel || "Link shared",
          body: linkUrl,
          contact_id: contactId,
        },
      }),
    onSuccess: () => {
      invalidate();
      setLinkUrl("");
      setLinkLabel("");
      toast.success("Link recorded");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to record link"),
  });

  // Tasks.
  const [taskTitle, setTaskTitle] = useState("");
  const addTaskMut = useMutation({
    mutationFn: () => addTaskFn({ data: { contact_id: contactId!, title: taskTitle } }),
    onSuccess: () => {
      invalidate();
      setTaskTitle("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add task"),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      toggleFn({ data: { id, completed } }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const removeTaskMut = useMutation({
    mutationFn: (id: string) => deleteTaskFn({ data: { id } }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const enrichMut = useMutation({
    mutationFn: () => enrichFn({ data: { id: contactId! } }),
    onSuccess: () => {
      toast.success("Enrichment kicked off");
      setTimeout(invalidate, 8_000);
      setTimeout(invalidate, 20_000);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl p-0 flex flex-col gap-0 overflow-hidden"
      >
        {isLoading || !c ? (
          <div className="p-10 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <SheetHeader className="px-6 pt-6 pb-3 border-b border-border space-y-0 text-left">
              <div className="flex items-start justify-between gap-4 pr-8">
                <div className="min-w-0">
                  <SheetTitle className="text-2xl font-semibold tracking-tight flex items-center gap-2 flex-wrap">
                    {c.full_name}
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${STAGE_COLORS[c.relationship_stage] ?? "bg-muted text-muted-foreground border-border"}`}
                    >
                      {c.relationship_stage}
                    </span>
                  </SheetTitle>
                  <div className="text-xs text-muted-foreground mt-1">
                    {c.title ?? "—"}
                    {c.company?.name && (
                      <>
                        {" · "}
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="size-3" />
                          {c.company.name}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        <Mail className="size-3" />
                        {c.email}
                      </a>
                    )}
                    {c.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" />
                        {c.phone}
                      </span>
                    )}
                    {c.linkedin_url && (
                      <a
                        href={c.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        <LinkIcon className="size-3" />
                        LinkedIn
                        <ExternalLink className="size-2.5" />
                      </a>
                    )}
                  </div>
                  {c.bio && (
                    <p className="text-sm mt-2 text-foreground/90">{c.bio}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => enrichMut.mutate()}
                      disabled={enrichMut.isPending || c.enrichment_status === "running"}
                    >
                      <Sparkles className="size-3.5" />
                      {c.enrichment_status === "running"
                        ? "Enriching…"
                        : enrichMut.isPending
                          ? "Starting…"
                          : "Refresh"}
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        to="/contacts/$id"
                        params={{ id: c.id }}
                        onClick={() => onOpenChange(false)}
                      >
                        <ExternalLink className="size-3.5 mr-1" />
                        Full page
                      </Link>
                    </Button>
                  </div>
                  {c.last_enriched_at && (
                    <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      Last enriched {formatDistanceToNow(new Date(c.last_enriched_at))} ago
                    </span>
                  )}
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto">
              <Tabs defaultValue="activity" className="w-full">
                <div className="px-6 pt-4">
                  <TabsList>
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                    <TabsTrigger value="tasks">
                      Tracking{" "}
                      {tasks.length > 0 && (
                        <span className="ml-1 text-muted-foreground text-[10px]">
                          ({tasks.filter((t: any) => !t.completed).length})
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="links">
                      Links{" "}
                      {linksShared.length > 0 && (
                        <span className="ml-1 text-muted-foreground text-[10px]">
                          ({linksShared.length})
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="notes">Notes</TabsTrigger>
                  </TabsList>
                </div>

                {/* Activity */}
                <TabsContent value="activity" className="px-6 pb-6 space-y-4 mt-4">
                  <div className="rounded-md border border-border p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center gap-2 flex-wrap">
                      {ACTIVITY_TYPES.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setActivityType(t.value)}
                          className={`text-[11px] font-mono uppercase tracking-widest px-2 py-1 rounded border ${
                            activityType === t.value
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <Input
                      value={activitySubject}
                      onChange={(e) => setActivitySubject(e.target.value)}
                      placeholder="Subject (e.g. 'Discovery call — pricing concerns')"
                    />
                    <Textarea
                      value={activityBody}
                      onChange={(e) => setActivityBody(e.target.value)}
                      placeholder="Details (optional)"
                      rows={2}
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => logMut.mutate()}
                        disabled={logMut.isPending || !activitySubject.trim()}
                      >
                        <Plus className="size-3.5 mr-1" />
                        {logMut.isPending ? "Logging…" : "Log activity"}
                      </Button>
                    </div>
                  </div>

                  <ul className="space-y-3">
                    {activities.map((a: any) => {
                      const Icon = ACTIVITY_ICON[a.type] ?? FileText;
                      return (
                        <li key={a.id} className="flex gap-3 pb-3 border-b border-border last:border-0">
                          <div className="size-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                            <Icon className="size-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm">{a.subject}</p>
                            {a.body && (
                              <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">
                                {a.body}
                              </p>
                            )}
                            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                              {a.type} ·{" "}
                              {formatDistanceToNow(new Date(a.occurred_at), { addSuffix: true })}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                    {activities.length === 0 && (
                      <li className="text-sm text-muted-foreground italic">No activity yet.</li>
                    )}
                  </ul>
                </TabsContent>

                {/* Tracking items (tasks) */}
                <TabsContent value="tasks" className="px-6 pb-6 space-y-4 mt-4">
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!taskTitle.trim()) return;
                      addTaskMut.mutate();
                    }}
                  >
                    <Input
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="Add tracking item (e.g. 'Send pricing deck')"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={addTaskMut.isPending || !taskTitle.trim()}
                    >
                      <Plus className="size-3.5 mr-1" />
                      Add
                    </Button>
                  </form>
                  <ul className="space-y-1">
                    {tasks.map((t: any) => (
                      <li
                        key={t.id}
                        className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            toggleMut.mutate({ id: t.id, completed: !t.completed })
                          }
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {t.completed ? (
                            <CheckSquare className="size-4 text-primary" />
                          ) : (
                            <Square className="size-4" />
                          )}
                        </button>
                        <span
                          className={`text-sm flex-1 ${
                            t.completed ? "line-through text-muted-foreground" : ""
                          }`}
                        >
                          {t.title}
                        </span>
                        {t.due_at && (
                          <Badge variant="outline" className="text-[10px]">
                            {new Date(t.due_at).toLocaleDateString()}
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => removeTaskMut.mutate(t.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                    {tasks.length === 0 && (
                      <li className="text-sm text-muted-foreground italic px-2 py-1">
                        Nothing to track yet.
                      </li>
                    )}
                  </ul>
                </TabsContent>

                {/* Links shared */}
                <TabsContent value="links" className="px-6 pb-6 space-y-4 mt-4">
                  <div className="rounded-md border border-border p-3 space-y-2 bg-muted/20">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-2">
                      <Input
                        value={linkLabel}
                        onChange={(e) => setLinkLabel(e.target.value)}
                        placeholder="Label (optional)"
                      />
                      <Input
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        placeholder="https://…"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => linkMut.mutate()}
                        disabled={linkMut.isPending || !linkUrl.trim()}
                      >
                        <LinkIcon className="size-3.5 mr-1" />
                        Record link
                      </Button>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {linksShared.map((a: any) => {
                      const match = (a.body ?? "").match(linkRegex) ?? (a.subject ?? "").match(linkRegex);
                      const url = match?.[0];
                      return (
                        <li
                          key={a.id}
                          className="flex items-start gap-2 p-2 rounded border border-border"
                        >
                          <LinkIcon className="size-3.5 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm">{a.subject}</div>
                            {url && (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-primary hover:underline break-all"
                              >
                                {url}
                              </a>
                            )}
                            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                              {formatDistanceToNow(new Date(a.occurred_at), { addSuffix: true })}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                    {linksShared.length === 0 && (
                      <li className="text-sm text-muted-foreground italic">
                        No links shared yet.
                      </li>
                    )}
                  </ul>
                </TabsContent>

                {/* Notes */}
                <TabsContent value="notes" className="px-6 pb-6 space-y-3 mt-4">
                  <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                    Free-form notes
                  </Label>
                  <Textarea
                    value={notesDraft}
                    onChange={(e) => {
                      setNotesDraft(e.target.value);
                      setNotesDirty(true);
                    }}
                    placeholder="Anything important about this contact…"
                    rows={10}
                  />
                  <div className="flex justify-end gap-2">
                    {notesDirty && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setNotesDraft(c.notes ?? "");
                          setNotesDirty(false);
                        }}
                      >
                        <X className="size-3.5 mr-1" />
                        Discard
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => saveNotes.mutate()}
                      disabled={!notesDirty || saveNotes.isPending}
                    >
                      <Save className="size-3.5 mr-1" />
                      {saveNotes.isPending ? "Saving…" : "Save notes"}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
