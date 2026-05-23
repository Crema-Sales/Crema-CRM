import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createTicket, listTickets } from "@/lib/crm.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Priority = "low" | "medium" | "high" | "urgent";

// Overdue tickets get a red dot. There's no read/unread column on tickets, so
// "cleared" is a per-browser acknowledgement: we remember which overdue tickets
// the user has dismissed in localStorage. The key includes `sla_due_at` so a
// ticket that re-overdues (SLA pushed out then missed again) resurfaces.
//
// The bubble's avatar badge, the support tab badge, and the "My tickets" tab
// badge all read from this same store via `useUnreadOverdueCount`, so clearing
// notices in one place clears every badge instantly.
const OVERDUE_ACK_KEY = "support-overdue-ack";
const OVERDUE_ACK_EVENT = "support-overdue-ack-changed";
const overdueKey = (t: any) => `${t.id}:${t.sla_due_at}`;

function getAckSnapshot(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(OVERDUE_ACK_KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribeAck(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === OVERDUE_ACK_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(OVERDUE_ACK_EVENT, cb);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(OVERDUE_ACK_EVENT, cb);
  };
}

function writeAck(keys: string[]) {
  try {
    localStorage.setItem(OVERDUE_ACK_KEY, JSON.stringify(keys));
  } catch {
    /* private mode / storage disabled — dots just won't persist as cleared */
  }
  // Notify same-tab subscribers; the native `storage` event only fires cross-tab.
  window.dispatchEvent(new Event(OVERDUE_ACK_EVENT));
}

function useOverdueAck(): Set<string> {
  const raw = useSyncExternalStore(subscribeAck, getAckSnapshot, () => "");
  return useMemo(() => {
    if (!raw) return new Set<string>();
    try {
      return new Set(JSON.parse(raw) as string[]);
    } catch {
      return new Set();
    }
  }, [raw]);
}

export function SupportPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");

  const listFn = useServerFn(listTickets);
  const createFn = useServerFn(createTicket);

  const { data: tickets = [] } = useQuery({
    queryKey: ["tickets"],
    queryFn: () => listFn(),
    refetchInterval: 15_000,
  });

  const myOpen = tickets.filter((t: any) => ["open", "pending"].includes(t.status));
  const overdue = myOpen.filter((t: any) => t.sla_due_at && new Date(t.sla_due_at) < new Date());

  const overdueAck = useOverdueAck();
  const unreadOverdue = overdue.filter((t: any) => !overdueAck.has(overdueKey(t)));

  const clearOverdueNotices = () => {
    // Rebuild from current overdue tickets — this self-prunes stale entries
    // for tickets that are no longer overdue.
    writeAck(overdue.map(overdueKey));
  };

  useEffect(() => {
    if (!overdue.length) return;
    const key = "overdue-toast-shown";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    toast.warning(`${overdue.length} ticket${overdue.length > 1 ? "s" : ""} past SLA`, {
      description: "Open the tickets page to review.",
      action: { label: "View", onClick: () => navigate({ to: "/tickets" }) },
    });
  }, [overdue.length, navigate]);

  const mutate = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success("Support request submitted", { description: "We'll be in touch shortly." });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      setSubject("");
      setDescription("");
      setPriority("medium");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not submit request"),
  });

  const submit = () => {
    if (subject.trim().length < 3) {
      toast.error("Subject must be at least 3 characters");
      return;
    }
    mutate.mutate({ data: { subject: subject.trim(), description: description.trim() || undefined, priority } });
  };

  return (
    <Tabs defaultValue="new" className="flex flex-col h-full min-h-0">
      <div className="px-3 pt-3 shrink-0">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="new">New request</TabsTrigger>
          <TabsTrigger value="mine">
            My tickets {unreadOverdue.length > 0 && <Badge variant="secondary" className="ml-1.5 h-4 text-[10px]">{unreadOverdue.length}</Badge>}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="new" className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 m-0">
        <div className="space-y-1.5">
          <Label htmlFor="sb-subject" className="text-xs">Subject</Label>
          <Input id="sb-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Briefly, what's up?" maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sb-desc" className="text-xs">Details</Label>
          <Textarea id="sb-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Steps, context, anything that helps…" rows={4} maxLength={5000} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low — whenever</SelectItem>
              <SelectItem value="medium">Medium — this week</SelectItem>
              <SelectItem value="high">High — today</SelectItem>
              <SelectItem value="urgent">Urgent — blocking</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button className="w-full" onClick={submit} disabled={mutate.isPending}>
          {mutate.isPending ? "Submitting…" : "Submit request"}
        </Button>
      </TabsContent>

      <TabsContent value="mine" className="flex-1 min-h-0 overflow-y-auto p-3 m-0">
        {myOpen.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No open tickets. Nice.</div>
        ) : (
          <div className="space-y-1.5">
            {unreadOverdue.length > 0 && (
              <div className="flex items-center justify-between pb-0.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {unreadOverdue.length} overdue
                </span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearOverdueNotices}>
                  Clear overdue notices
                </Button>
              </div>
            )}
            {myOpen.map((t: any) => {
              const od = t.sla_due_at && new Date(t.sla_due_at) < new Date();
              const unread = od && !overdueAck.has(overdueKey(t));
              return (
                <button
                  key={t.id}
                  onClick={() => { onClose(); navigate({ to: "/tickets" }); }}
                  className="w-full text-left p-2.5 rounded-md border border-border hover:bg-accent transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.subject}</div>
                      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                        {t.status} · {t.priority} · {t.sla_due_at ? `${od ? "overdue " : ""}${formatDistanceToNow(new Date(t.sla_due_at), { addSuffix: true })}` : "no SLA"}
                      </div>
                    </div>
                    {unread && <span className="size-2 rounded-full bg-destructive mt-1.5 animate-pulse" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <Button variant="outline" className="w-full mt-3" onClick={() => { onClose(); navigate({ to: "/tickets" }); }}>
          Open ticket workspace
        </Button>
      </TabsContent>
    </Tabs>
  );
}

export function useUnreadOverdueCount(): number {
  const listFn = useServerFn(listTickets);
  const { data: tickets = [] } = useQuery({
    queryKey: ["tickets"],
    queryFn: () => listFn(),
    refetchInterval: 15_000,
  });
  const ack = useOverdueAck();
  const nowMs = Date.now();
  return tickets.filter(
    (t: any) =>
      (t.status === "open" || t.status === "pending") &&
      t.sla_due_at &&
      new Date(t.sla_due_at).getTime() < nowMs &&
      !ack.has(`${t.id}:${t.sla_due_at}`),
  ).length;
}
