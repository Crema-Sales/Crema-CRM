import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getToday, toggleTask } from "@/lib/crm.functions";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Star, ListTodo, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useRegisterHelp } from "@/hooks/use-help";
import { todayHelpContent } from "@/components/help/content/today-help";
import { QuotaCard } from "@/components/quota-card";
import { cn } from "@/lib/utils";

const CHECK_LINGER_MS = 380;

export const Route = createFileRoute("/_authenticated/today")({ component: TodayPage });

const STAGE_LABEL: Record<string, string> = {
  "lead:drip": "Lead · Drip", "lead:calendly": "Lead · Calendly",
  "contact:discovery": "Contact · Discovery", "contact:deal": "Contact · Create deal",
  "deal:proposal": "Deal · Proposal", "deal:sign": "Deal · Sign",
};

const PRIORITY_TONE: Record<string, string> = {
  urgent: "text-destructive border-destructive/50",
  high: "text-[#c9885a] border-[#c9885a]/50",
  medium: "text-muted-foreground",
  low: "text-muted-foreground opacity-70",
};

function TodayPage() {
  useRegisterHelp(todayHelpContent);
  const qc = useQueryClient();
  const fn = useServerFn(getToday);
  const toggleFn = useServerFn(toggleTask);
  const { data } = useQuery({ queryKey: ["today"], queryFn: () => fn() });

  const sortedTasks = sortTasks(data?.tasks ?? []);
  const showEmptyState =
    data !== undefined && (data.top?.length ?? 0) === 0 && sortedTasks.length === 0;

  // Tracks tasks that have been checked locally but not yet removed from the
  // list — lets us show the check + strikethrough briefly before the row exits.
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  // Tracks tasks that have begun their exit animation; we filter them out of
  // the rendered list so AnimatePresence runs the exit transition.
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());

  const toggle = useMutation({
    mutationFn: (v: { id: string; completed: boolean }) => toggleFn({ data: v }),
    // Await the refetch BEFORE clearing local exit state — otherwise the row
    // briefly reappears in the window between clearing exitingIds and the new
    // (task-less) data arriving from the server.
    onSuccess: async (_d, v) => {
      await qc.invalidateQueries({ queryKey: ["today"] });
      setCompletingIds((prev) => {
        if (!prev.has(v.id)) return prev;
        const next = new Set(prev);
        next.delete(v.id);
        return next;
      });
      setExitingIds((prev) => {
        if (!prev.has(v.id)) return prev;
        const next = new Set(prev);
        next.delete(v.id);
        return next;
      });
    },
  });

  const handleToggle = (id: string, checked: boolean) => {
    if (!checked) {
      toggle.mutate({ id, completed: false });
      return;
    }
    setCompletingIds((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      setExitingIds((prev) => new Set(prev).add(id));
      toggle.mutate({ id, completed: true });
    }, CHECK_LINGER_MS);
  };

  const visibleTasks = sortedTasks.filter((t) => !exitingIds.has(t.id));

  return (
    <div className="px-4 md:px-8 py-8 max-w-[1100px] mx-auto space-y-8">
      <header>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Today</div>
        <h1 className="text-4xl md:text-5xl font-medium tracking-tight" style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}>
          Start here to do the work.
        </h1>
        <p className="text-muted-foreground mt-2">
          Your top relationships and the tasks that move them forward.
        </p>
      </header>

      <QuotaCard />

      {showEmptyState && <NewRepEmptyState />}

      <Section icon={Star} title="Top relationships" copy="Ranked by open pipeline value." count={data?.top?.length ?? 0} accent>
        {(data?.top ?? []).map((r: any) => (
          <TopRelationshipRow key={r.id} relationship={r} />
        ))}
        {data !== undefined && (data.top?.length ?? 0) === 0 && (
          <div className="text-sm text-muted-foreground italic py-4">
            No relationships yet. Head to{" "}
            <Link to="/relationships" className="underline hover:text-foreground">Relationships</Link>{" "}
            to add one.
          </div>
        )}
      </Section>

      <Section icon={ListTodo} title="Open tasks" copy="Everything assigned to you, not yet done." count={sortedTasks.length}>
        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {visibleTasks.map((t: any) => {
              const overdue = isOverdue(t.due_at);
              const isCompleting = completingIds.has(t.id);
              return (
                <motion.li
                  key={t.id}
                  layout
                  initial={false}
                  exit={{
                    opacity: 0,
                    x: 80,
                    height: 0,
                    marginTop: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                    transition: { duration: 0.32, ease: [0.4, 0, 0.2, 1] },
                  }}
                  transition={{ layout: { duration: 0.28, ease: [0.4, 0, 0.2, 1] } }}
                  style={{ overflow: "hidden" }}
                >
                  <Card
                    className={cn(
                      "p-3 border-border flex items-start gap-3 transition-colors duration-200",
                      isCompleting && "bg-[#c9885a]/10 border-[#c9885a]/40",
                      !isCompleting && taskEntityLink(t) && "hover:border-[#c9885a]/50",
                    )}
                  >
                    <Checkbox
                      checked={isCompleting || t.completed}
                      onCheckedChange={(c) => handleToggle(t.id, Boolean(c))}
                      disabled={isCompleting}
                      className="mt-0.5"
                    />
                    <TaskBody task={t} overdue={overdue} isCompleting={isCompleting} />
                  </Card>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {sortedTasks.length === 0 && (
            <li className="text-sm text-muted-foreground italic py-4">All clear. Pour another cup.</li>
          )}
        </ul>
      </Section>
    </div>
  );
}

type TaskLink = { to: "/deals/$id" | "/contacts/$id"; params: { id: string } } | { to: "/tickets" };

function taskEntityLink(t: any): TaskLink | null {
  if (t.related_deal_id) return { to: "/deals/$id", params: { id: t.related_deal_id } };
  if (t.related_contact_id) return { to: "/contacts/$id", params: { id: t.related_contact_id } };
  if (t.related_ticket_id) return { to: "/tickets" };
  return null;
}

function TaskBody({ task, overdue, isCompleting }: { task: any; overdue: boolean; isCompleting: boolean }) {
  const link = taskEntityLink(task);
  const inner = (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            "font-medium text-sm transition-colors duration-200",
            isCompleting && "line-through text-muted-foreground",
          )}
        >
          {task.title}
        </span>
        {task.priority && task.priority !== "medium" && (
          <Badge
            variant="outline"
            className={`font-mono text-[9px] uppercase tracking-widest ${PRIORITY_TONE[task.priority] ?? ""}`}
          >
            {task.priority}
          </Badge>
        )}
        {task.stage_key && (
          <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-widest">
            {STAGE_LABEL[task.stage_key] ?? task.stage_key}
          </Badge>
        )}
      </div>
      {task.due_at && (
        <div
          className={`font-mono text-[10px] uppercase tracking-widest mt-1 ${
            overdue ? "text-destructive font-semibold" : "text-muted-foreground"
          }`}
        >
          {overdue ? "overdue · " : "due "}
          {formatDistanceToNow(new Date(task.due_at), { addSuffix: true })}
        </div>
      )}
    </>
  );
  if (!link) return <div className="flex-1 min-w-0">{inner}</div>;
  return (
    <Link
      {...(link as any)}
      className="block flex-1 min-w-0 hover:[&_.font-medium]:text-[#c9885a] transition-colors"
    >
      {inner}
    </Link>
  );
}

function Section({ icon: Icon, title, copy, count, accent, children }: any) {
  return (
    <section>
      <div className="flex items-end justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`size-8 rounded-lg flex items-center justify-center ${accent ? "bg-[#c9885a]/15 text-[#c9885a]" : "bg-muted text-muted-foreground"}`}>
            <Icon className="size-4" />
          </div>
          <div>
            <h2 className="text-xl font-medium tracking-tight" style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}>
              {title} <span className="font-sans font-normal text-muted-foreground tabular-nums ml-1">{count}</span>
            </h2>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{copy}</div>
          </div>
        </div>
      </div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function isOverdue(dueAt: string | null | undefined) {
  return Boolean(dueAt && new Date(dueAt).getTime() < Date.now());
}

// Urgent > high > medium > low; within a tier overdue first, then due_at ASC nulls last.
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function sortTasks(tasks: any[]) {
  return [...tasks].sort((a, b) => {
    const ap = PRIORITY_RANK[a.priority] ?? 2;
    const bp = PRIORITY_RANK[b.priority] ?? 2;
    if (ap !== bp) return ap - bp;
    const aOver = isOverdue(a.due_at);
    const bOver = isOverdue(b.due_at);
    if (aOver !== bOver) return aOver ? -1 : 1;
    if (!a.due_at && !b.due_at) return 0;
    if (!a.due_at) return 1;
    if (!b.due_at) return -1;
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  });
}

function formatCurrency(n: number) {
  if (!n) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function NewRepEmptyState() {
  return (
    <Card className="p-6 border-border border-dashed flex items-start gap-4">
      <div className="size-10 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
        <Inbox className="size-5" />
      </div>
      <div className="flex-1">
        <h2 className="text-xl font-medium tracking-tight" style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}>
          Nothing on your plate yet.
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          You have no relationships or open tasks. Head to{" "}
          <Link to="/relationships" className="underline hover:text-foreground">Relationships</Link>{" "}
          to add your first one, or ask your admin to assign you a book.
        </p>
      </div>
    </Card>
  );
}

function TopRelationshipRow({ relationship }: { relationship: any }) {
  const value = Number(relationship.expected_value ?? 0);
  const openDeals = Number(relationship.open_deals ?? 0);
  const title = relationship.name ?? relationship.company_name ?? "Untitled relationship";
  return (
    <Link to="/relationships" className="block">
      <Card className="p-3 border-border hover:border-[#c9885a]/50 transition-colors">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium truncate">{title}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground truncate">
              {relationship.company_name ?? "—"} · {relationship.status}
              {openDeals > 0 && ` · ${openDeals} open deal${openDeals === 1 ? "" : "s"}`}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-sm tabular-nums">{formatCurrency(value)}</div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              expected
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
