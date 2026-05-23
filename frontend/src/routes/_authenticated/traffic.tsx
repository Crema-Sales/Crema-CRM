import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTrafficOverview } from "@/auth/analytics-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { useRegisterHelp } from "@/hooks/use-help";
import { trafficHelpContent } from "@/components/help/content/traffic-help";

// `occurred_at` comes back as ISO from app-inserted rows (e.g. "2026-05-19T07:58:41.290Z")
// and as SQLite-formatted from default-inserted rows (e.g. "2026-05-19 07:54:06").
// Normalize so date-fns doesn't throw a RangeError on either.
function parseOccurredAt(raw: string): Date {
  const looksIso = raw.includes("T");
  const withTz = looksIso ? raw : `${raw.replace(" ", "T")}Z`;
  return new Date(withTz);
}

function relative(raw: string): string {
  return formatDistanceToNow(parseOccurredAt(raw), { addSuffix: true });
}

export const Route = createFileRoute("/_authenticated/traffic")({ component: TrafficPage });

function TrafficPage() {
  useRegisterHelp(trafficHelpContent);
  const fetchFn = useServerFn(getTrafficOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["traffic"],
    queryFn: () => fetchFn(),
    refetchInterval: 5_000,
  });

  const visitors = data?.totals.visitors ?? 0;
  const converted = data?.totals.converted ?? 0;
  const rate = visitors > 0 ? Math.round((converted / visitors) * 100) : 0;

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto space-y-5">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Visitor Activity
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Visitors that became leads</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Every anonymous visitor that ran the Crema snippet and then resolved to a contact
          when <code className="font-mono">crema.identify()</code> fired — with the full
          pre-identification journey rolled up. Raw event metrics live under the Metrics tab.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Unique visitors" value={visitors} />
        <Stat label="Became leads" value={converted} />
        <Stat label="Conversion rate" value={`${rate}%`} />
      </div>

      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="leads">
          <Card className="border-border p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold">Converted visitors</h2>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                newest first · refreshes every 5s
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-2 font-medium">Lead</th>
                    <th className="px-4 py-2 font-medium">Stage</th>
                    <th className="px-4 py-2 font-medium">First touch</th>
                    <th className="px-4 py-2 font-medium">Became a lead</th>
                    <th className="px-4 py-2 font-medium">Journey</th>
                    <th className="px-4 py-2 font-medium">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  ) : (data?.converted ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        No visitors have converted to leads yet. When a tracked visitor calls{" "}
                        <code className="font-mono">crema.identify()</code>, they show up here
                        with their full pre-identification journey.
                      </td>
                    </tr>
                  ) : (
                    data!.converted.map((v) => {
                      const since = v.total_events - v.anon_touches;
                      return (
                        <tr key={v.anonymous_id} className="border-t border-border">
                          <td className="px-4 py-2">
                            <Link
                              to="/contacts/$id"
                              params={{ id: v.contact_id }}
                              className="hover:underline"
                            >
                              <span className="font-medium">{v.contact_name}</span>
                              {v.contact_email ? (
                                <span className="text-muted-foreground"> · {v.contact_email}</span>
                              ) : null}
                            </Link>
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant="outline" className="font-mono text-[10px] capitalize">
                              {v.relationship_stage}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground tabular-nums">
                            {relative(v.first_seen)}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground tabular-nums">
                            {relative(v.identified_at)}
                          </td>
                          <td className="px-4 py-2 tabular-nums">
                            <span className="text-muted-foreground">
                              {v.anon_touches} anon
                            </span>
                            {" → "}
                            <span>{since} identified</span>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground tabular-nums">
                            {relative(v.last_seen)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Events" value={data?.totals.events ?? 0} />
            <Stat label="Unique visitors" value={visitors} />
            <Stat label="Identified" value={data?.totals.identified ?? 0} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="border-border p-5 space-y-3">
              <h2 className="text-sm font-semibold">Events by type</h2>
              {(data?.counts ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No events yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data!.counts.map((c) => (
                    <li
                      key={c.event_name}
                      className="flex items-center justify-between text-xs"
                    >
                      <code className="font-mono">{c.event_name}</code>
                      <span className="tabular-nums text-muted-foreground">{c.n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="border-border p-5 space-y-3">
              <h2 className="text-sm font-semibold">Top pages</h2>
              {(data?.topPaths ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No pageviews yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data!.topPaths.map((p) => (
                    <li key={p.path} className="flex items-center justify-between text-xs">
                      <span className="font-mono truncate max-w-[70%]">{p.path}</span>
                      <span className="tabular-nums text-muted-foreground">{p.n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="border-border p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold">Live event stream</h2>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                last 200 · refreshes every 5s
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-2 font-medium">When</th>
                    <th className="px-4 py-2 font-medium">Event</th>
                    <th className="px-4 py-2 font-medium">Who</th>
                    <th className="px-4 py-2 font-medium">Path</th>
                    <th className="px-4 py-2 font-medium">Referrer</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  ) : (data?.events ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                        No events yet. Drop the snippet on a page and reload.
                      </td>
                    </tr>
                  ) : (
                    data!.events.map((e) => (
                      <tr key={e.id} className="border-t border-border">
                        <td className="px-4 py-2 text-muted-foreground tabular-nums">
                          {relative(e.occurred_at)}
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {e.event_name}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">
                          {e.contact_email ? (
                            <span>
                              {e.contact_name ? `${e.contact_name} · ` : ""}
                              <span className="text-muted-foreground">{e.contact_email}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              anon · <code className="font-mono">{e.anonymous_id.slice(0, 8)}</code>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 font-mono">{e.path ?? "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground truncate max-w-[200px]">
                          {e.referrer ?? "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="border-border px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-3xl font-semibold tabular-nums mt-1">{value}</div>
    </Card>
  );
}
