import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addTicketComment, getTicket, listAssignableUsers, listTickets, updateTicket } from "@/lib/crm.functions";
import { getSession } from "@/auth/server-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { AlertCircle, Clock, CheckCircle2, MessageSquare, Lock } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { useRegisterHelp } from "@/hooks/use-help";
import { ticketsHelpContent } from "@/components/help/content/tickets-help";
import { usePeek } from "@/components/peek/peek-context";

export const Route = createFileRoute("/_authenticated/tickets")({ component: TicketsPage });

type Status = "open" | "pending" | "resolved" | "closed";
type Priority = "low" | "medium" | "high" | "urgent";
type Filter = "open" | "past" | "all";

const priorityRank: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function priorityVariant(p: Priority): "default" | "secondary" | "destructive" | "outline" {
  return p === "urgent" ? "destructive" : p === "high" ? "default" : "secondary";
}

function statusVariant(s: Status): "default" | "secondary" | "destructive" | "outline" {
  return s === "resolved" || s === "closed" ? "outline" : s === "pending" ? "secondary" : "default";
}

function slaState(sla?: string | null, status?: Status) {
  if (!sla || status === "resolved" || status === "closed") return { label: "—", color: "text-muted-foreground", overdue: false };
  const due = new Date(sla).getTime();
  const nowMs = Date.now();
  const overdue = due < nowMs;
  const distance = formatDistanceToNow(new Date(sla), { addSuffix: true });
  return {
    label: overdue ? `Overdue ${distance}` : `SLA ${distance}`,
    color: overdue ? "text-destructive" : (due - nowMs) < 6 * 3600e3 ? "text-amber-500" : "text-muted-foreground",
    overdue,
  };
}

function TicketsPage() {
  useRegisterHelp(ticketsHelpContent);
  const { peek } = usePeek();
  const listFn = useServerFn(listTickets);
  const sessionFn = useServerFn(getSession);
  const { data: tickets = [] } = useQuery({
    queryKey: ["tickets"],
    queryFn: () => listFn(),
    refetchInterval: 15_000, // polling replaces Supabase realtime
  });
  const { data: session } = useQuery({ queryKey: ["session"], queryFn: () => sessionFn() });
  const meId = session?.userId ?? null;

  const [filter, setFilter] = useState<Filter>("open");
  const [mineOnly, setMineOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return tickets
      .filter((t: any) => {
        if (filter === "open" && !["open", "pending"].includes(t.status)) return false;
        if (filter === "past" && !["resolved", "closed"].includes(t.status)) return false;
        if (mineOnly && meId && t.assigned_to !== meId) return false;
        if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
        if (overdueOnly && !(t.sla_due_at && new Date(t.sla_due_at) < new Date() && ["open","pending"].includes(t.status))) return false;
        return true;
      })
      .sort((a: any, b: any) => {
        const aOver = a.sla_due_at && new Date(a.sla_due_at) < new Date() && ["open","pending"].includes(a.status);
        const bOver = b.sla_due_at && new Date(b.sla_due_at) < new Date() && ["open","pending"].includes(b.status);
        if (aOver !== bOver) return aOver ? -1 : 1;
        const pr = priorityRank[a.priority as Priority] - priorityRank[b.priority as Priority];
        if (pr !== 0) return pr;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [tickets, filter, mineOnly, overdueOnly, priorityFilter, meId]);

  const counts = useMemo(() => {
    const open = tickets.filter((t: any) => ["open", "pending"].includes(t.status)).length;
    const overdue = tickets.filter((t: any) => t.sla_due_at && new Date(t.sla_due_at) < new Date() && ["open","pending"].includes(t.status)).length;
    const weekAgo = Date.now() - 7 * 86400e3;
    const resolvedWeek = tickets.filter((t: any) => t.status === "resolved" && t.resolved_at && new Date(t.resolved_at).getTime() > weekAgo).length;
    return { open, overdue, resolvedWeek };
  }, [tickets]);

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
            customer support workspace
          </p>
        </div>
        <div className="flex gap-2">
          <Stat label="Open" value={counts.open} icon={<Clock className="size-3.5" />} />
          <Stat label="Overdue" value={counts.overdue} icon={<AlertCircle className="size-3.5" />} tone={counts.overdue > 0 ? "destructive" : "muted"} />
          <Stat label="Resolved (7d)" value={counts.resolvedWeek} icon={<CheckCircle2 className="size-3.5" />} tone="success" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="past">Past</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch id="mine" checked={mineOnly} onCheckedChange={setMineOnly} />
            <Label htmlFor="mine" className="text-xs cursor-pointer">Assigned to me</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="overdue" checked={overdueOnly} onCheckedChange={setOverdueOnly} />
            <Label htmlFor="overdue" className="text-xs cursor-pointer">Overdue only</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as Priority | "all")}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground border-dashed">
            No tickets match the current filters.
          </Card>
        ) : filtered.map((t: any) => {
          const sla = slaState(t.sla_due_at, t.status as Status);
          return (
            <Card
              key={t.id}
              onClick={() => setOpenId(t.id)}
              className={`p-4 cursor-pointer hover:bg-accent/40 transition-colors ${sla.overdue ? "border-destructive/50" : "border-border"}`}
            >
              <div className="flex items-start gap-3">
                {sla.overdue
                  ? <AlertCircle className="size-4 text-destructive mt-0.5 shrink-0 animate-pulse" />
                  : t.status === "resolved" || t.status === "closed"
                    ? <CheckCircle2 className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                    : <Clock className="size-4 text-muted-foreground mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{t.subject}</span>
                    <Badge variant={priorityVariant(t.priority)} className="capitalize text-[10px]">{t.priority}</Badge>
                    <Badge variant={statusVariant(t.status)} className="capitalize text-[10px]">{t.status}</Badge>
                  </div>
                  {t.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
                  <div className="flex items-center gap-3 mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t.contact?.full_name && t.contact_id ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          peek("contact", t.contact_id);
                        }}
                        className="uppercase hover:text-primary"
                      >
                        {t.contact.full_name}
                      </button>
                    ) : (
                      <span>—</span>
                    )}
                    <span className={sla.color}>{sla.label}</span>
                    <span>opened {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <TicketDrawer ticketId={openId} onClose={() => setOpenId(null)} meId={meId} />
    </div>
  );
}

function Stat({ label, value, icon, tone = "muted" }: { label: string; value: number; icon: React.ReactNode; tone?: "muted" | "destructive" | "success" }) {
  const color = tone === "destructive" ? "text-destructive" : tone === "success" ? "text-emerald-500" : "text-muted-foreground";
  return (
    <Card className="px-3 py-2 flex items-center gap-2 min-w-[110px]">
      <span className={color}>{icon}</span>
      <div>
        <div className="text-lg font-semibold leading-none">{value}</div>
        <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">{label}</div>
      </div>
    </Card>
  );
}

function TicketDrawer({ ticketId, onClose, meId }: { ticketId: string | null; onClose: () => void; meId: string | null }) {
  const { peek } = usePeek();
  const qc = useQueryClient();
  const getFn = useServerFn(getTicket);
  const updateFn = useServerFn(updateTicket);
  const commentFn = useServerFn(addTicketComment);
  const usersFn = useServerFn(listAssignableUsers);

  const { data, isLoading } = useQuery({
    queryKey: ["ticket", ticketId],
    queryFn: () => getFn({ data: { id: ticketId! } }),
    enabled: !!ticketId,
    refetchInterval: ticketId ? 15_000 : false,
  });
  const { data: users = [] } = useQuery({ queryKey: ["assignable-users"], queryFn: () => usersFn(), enabled: !!ticketId });

  const [comment, setComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");

  useEffect(() => { setComment(""); setIsInternal(false); setResolveOpen(false); setResolutionNote(""); }, [ticketId]);

  const updateMut = useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const commentMut = useMutation({
    mutationFn: commentFn,
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
      toast.success("Comment posted");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not post comment"),
  });

  const t = data?.ticket;
  const comments = data?.comments ?? [];
  const sla = t ? slaState(t.sla_due_at, t.status as Status) : null;

  return (
    <Sheet open={!!ticketId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {isLoading || !t ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6">{t.subject}</SheetTitle>
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Badge variant={priorityVariant(t.priority)} className="capitalize text-[10px]">{t.priority}</Badge>
                <Badge variant={statusVariant(t.status)} className="capitalize text-[10px]">{t.status}</Badge>
                {sla && (
                  <span className={`font-mono text-[10px] uppercase tracking-widest ${sla.color}`}>{sla.label}</span>
                )}
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-5">
              {t.description && (
                <Card className="p-3 text-sm bg-muted/30">{t.description}</Card>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={t.status} onValueChange={(v) => updateMut.mutate({ data: { id: t.id, status: v as Status } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Priority</Label>
                  <Select value={t.priority} onValueChange={(v) => updateMut.mutate({ data: { id: t.id, priority: v as Priority } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Assignee</Label>
                <Select
                  value={t.assigned_to ?? "unassigned"}
                  onValueChange={(v) => updateMut.mutate({ data: { id: t.id, assigned_to: v === "unassigned" ? null : v } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {users.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name ?? u.id.slice(0, 8)} {u.id === meId ? "(me)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground border-t border-border pt-3 space-y-0.5">
                <div>
                  Contact:{" "}
                  {t.contact?.full_name && t.contact_id ? (
                    <button
                      type="button"
                      onClick={() => peek("contact", t.contact_id)}
                      className="uppercase hover:text-primary"
                    >
                      {t.contact.full_name}
                    </button>
                  ) : (
                    "—"
                  )}{" "}
                  {t.contact?.email && `· ${t.contact.email}`}
                </div>
                <div>Opened: {format(new Date(t.created_at), "PPp")}</div>
                {t.resolved_at && <div>Resolved: {format(new Date(t.resolved_at), "PPp")}</div>}
              </div>

              {t.resolution_note && (
                <Card className="p-3 text-sm border-emerald-500/30 bg-emerald-500/5">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-600 mb-1">Resolution</div>
                  {t.resolution_note}
                </Card>
              )}

              {!["resolved","closed"].includes(t.status) && (
                <>
                  {!resolveOpen ? (
                    <Button variant="outline" className="w-full" onClick={() => setResolveOpen(true)}>
                      <CheckCircle2 className="size-4 mr-2" /> Resolve ticket
                    </Button>
                  ) : (
                    <Card className="p-3 space-y-2">
                      <Label className="text-xs">Resolution note</Label>
                      <Textarea
                        value={resolutionNote}
                        onChange={(e) => setResolutionNote(e.target.value)}
                        rows={3}
                        placeholder="What was the fix?"
                        maxLength={2000}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (resolutionNote.trim().length < 3) { toast.error("Add a brief resolution note"); return; }
                            updateMut.mutate({ data: { id: t.id, status: "resolved", resolution_note: resolutionNote.trim() } });
                            setResolveOpen(false);
                          }}
                        >Confirm resolve</Button>
                        <Button size="sm" variant="ghost" onClick={() => setResolveOpen(false)}>Cancel</Button>
                      </div>
                    </Card>
                  )}
                </>
              )}

              <div className="space-y-3 border-t border-border pt-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Activity</h3>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{comments.length}</span>
                </div>
                <div className="space-y-2">
                  {comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No comments yet.</p>
                  ) : comments.map((c: any) => (
                    <div key={c.id} className={`p-2.5 rounded-md border ${c.is_internal ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-background"}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Avatar className="size-5">
                          <AvatarFallback className="text-[10px]">
                            {(c.author?.full_name ?? "??").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium">{c.author?.full_name ?? "System"}</span>
                        {c.is_internal && (
                          <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 gap-1">
                            <Lock className="size-2.5" /> internal
                          </Badge>
                        )}
                        <span className="font-mono text-[10px] text-muted-foreground ml-auto">
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="text-sm whitespace-pre-wrap pl-7">{c.body}</div>
                    </div>
                  ))}
                </div>

                <Card className="p-3 space-y-2">
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    placeholder="Add a comment…"
                    maxLength={5000}
                  />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Switch checked={isInternal} onCheckedChange={setIsInternal} />
                      <Lock className="size-3" /> Internal note
                    </label>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!comment.trim()) return;
                        commentMut.mutate({ data: { ticket_id: t.id, body: comment.trim(), is_internal: isInternal } });
                      }}
                      disabled={commentMut.isPending || !comment.trim()}
                    >Post</Button>
                  </div>
                </Card>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
