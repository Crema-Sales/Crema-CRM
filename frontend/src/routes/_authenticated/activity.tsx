import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listActivities } from "@/lib/crm.functions";
import { Card } from "@/components/ui/card";
import { Mail, Phone, Calendar, FileText, Zap, ArrowUpRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useRegisterHelp } from "@/hooks/use-help";
import { activityHelpContent } from "@/components/help/content/activity-help";

const ICON: Record<string, any> = { email: Mail, call: Phone, meeting: Calendar, note: FileText, signal: Zap, system: ArrowUpRight };

export const Route = createFileRoute("/_authenticated/activity")({ component: ActivityPage });

function ActivityPage() {
  useRegisterHelp(activityHelpContent);
  const fn = useServerFn(listActivities);
  const { data = [] } = useQuery({ queryKey: ["activities"], queryFn: () => fn() });

  return (
    <div className="px-6 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{data.length} recent signals</p>
      </div>
      <Card className="border-border divide-y divide-border">
        {data.map((a: any) => {
          const Icon = ICON[a.type] ?? FileText;
          return (
            <div key={a.id} className="flex gap-3 p-4">
              <div className="size-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                <Icon className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{a.subject}</div>
                {a.body && <p className="text-xs text-muted-foreground mt-0.5">{a.body}</p>}
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                  {a.type} · {a.contact?.full_name ?? "system"} · {formatDistanceToNow(new Date(a.occurred_at), { addSuffix: true })}
                </div>
              </div>
            </div>
          );
        })}
        {data.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No activity yet.</div>}
      </Card>
    </div>
  );
}