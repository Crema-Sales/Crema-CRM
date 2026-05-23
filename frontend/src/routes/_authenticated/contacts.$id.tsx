import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { enrichContactNow, fireTestActivity, getContact, getMe, listAssignableUsers, upsertContact } from "@/lib/crm.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Mail, Phone, Calendar, FileText, Zap, Star, Building2, Send, UserRound, Sparkles, Link as LinkIcon, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useRegisterHelp } from "@/hooks/use-help";
import { contactDetailHelpContent } from "@/components/help/content/contact-detail-help";
import { usePeek } from "@/components/peek/peek-context";

export const Route = createFileRoute("/_authenticated/contacts/$id")({
  component: ContactDetailPage,
});

const ICON: Record<string, any> = {
  email: Mail,
  call: Phone,
  meeting: Calendar,
  note: FileText,
  signal: Zap,
  system: FileText,
};

function ContactDetailPage() {
  useRegisterHelp(contactDetailHelpContent);
  const { peek } = usePeek();
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const fn = useServerFn(getContact);
  const fireFn = useServerFn(fireTestActivity);
  const meFn = useServerFn(getMe);
  const usersFn = useServerFn(listAssignableUsers);
  const upsertFn = useServerFn(upsertContact);
  const enrichFn = useServerFn(enrichContactNow);
  const { data, isLoading } = useQuery({
    queryKey: ["contact", id],
    queryFn: () => fn({ data: { id } }),
    // 3s poll so the MUST #4 demo (marketing form / pixel / fire-test-event)
    // shows new activity rows landing without a manual refresh. Backs off
    // when the tab is hidden — React Query handles that natively.
    refetchInterval: 3_000,
  });
  const me = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const canReassign = (me.data?.roles ?? []).some((r: string) => r === "admin" || r === "manager");
  const users = useQuery({
    queryKey: ["assignable-users"],
    queryFn: () => usersFn(),
    enabled: canReassign,
  });
  const fire = useMutation({
    mutationFn: () => fireFn({ data: { contact_id: id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact", id] });
      toast.success("Fired test event — watch the timeline");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to fire test event"),
  });
  const enrichMut = useMutation({
    mutationFn: () => enrichFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Enrichment kicked off — refresh in ~15s");
      setTimeout(() => qc.invalidateQueries({ queryKey: ["contact", id] }), 8_000);
      setTimeout(() => qc.invalidateQueries({ queryKey: ["contact", id] }), 20_000);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const reassign = useMutation({
    mutationFn: (ownerId: string) =>
      upsertFn({
        data: {
          id,
          full_name: data?.contact?.full_name ?? "",
          email: data?.contact?.email ?? undefined,
          phone: data?.contact?.phone ?? undefined,
          title: data?.contact?.title ?? undefined,
          company_id: data?.contact?.company_id ?? null,
          notes: data?.contact?.notes ?? undefined,
          owner_id: ownerId,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact", id] });
      qc.invalidateQueries({ queryKey: ["funnel"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Owner updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Reassignment failed"),
  });
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);

  if (isLoading) return <div className="px-6 py-6 text-sm text-muted-foreground">Loading…</div>;
  if (!data?.contact)
    return <div className="px-6 py-6 text-sm text-muted-foreground">Not found.</div>;
  const c = data.contact;

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/contacts">
          <ArrowLeft className="size-3.5 mr-1" />
          All contacts
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{c.full_name}</h1>
            {c.is_ideal_customer && (
              <Badge className="bg-primary/10 text-primary border-primary/30">
                <Star className="size-3 mr-1 fill-primary" />
                Ideal customer
              </Badge>
            )}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
            {c.title ?? "—"} · {c.company?.name ?? "no company"}
          </div>
          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground flex-wrap">
            {c.email && (
              <span className="flex items-center gap-1">
                <Mail className="size-3.5" />
                {c.email}
              </span>
            )}
            {c.phone && (
              <span className="flex items-center gap-1">
                <Phone className="size-3.5" />
                {c.phone}
              </span>
            )}
            {c.linkedin_url && (
              <a
                href={c.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-foreground"
              >
                <LinkIcon className="size-3.5" />
                LinkedIn
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          {c.bio && <p className="text-sm mt-3 max-w-2xl">{c.bio}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end gap-1">
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
                  : "Refresh enrichment"}
            </Button>
            {c.last_enriched_at && (
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Last enriched {formatDistanceToNow(new Date(c.last_enriched_at))} ago
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fire.mutate()}
            disabled={fire.isPending}
            title="Insert a synthetic signal activity (MUST #4 demo)"
          >
            <Send className="size-3.5 mr-1.5" />
            {fire.isPending ? "Firing…" : "Fire test event"}
          </Button>
          <Card className="px-5 py-3 border-border">
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Lifetime value
            </div>
            <div className="text-2xl font-semibold tabular-nums text-primary">{fmt(data.ltv)}</div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-border p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold mb-4">Activity timeline</h2>
          <ul className="space-y-3">
            {data.activities.map((a: any) => {
              const Icon = ICON[a.type] ?? FileText;
              return (
                <li key={a.id} className="flex gap-3 pb-3 border-b border-border last:border-0">
                  <div className="size-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Icon className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{a.subject}</p>
                    {a.body && <p className="text-xs text-muted-foreground mt-0.5">{a.body}</p>}
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {a.type} · {formatDistanceToNow(new Date(a.occurred_at), { addSuffix: true })}
                    </span>
                  </div>
                </li>
              );
            })}
            {data.activities.length === 0 && (
              <li className="text-sm text-muted-foreground">No activity yet.</li>
            )}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card className="border-border p-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <UserRound className="size-4" />
              Owner
            </h2>
            {canReassign ? (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Sales rep</Label>
                <Select
                  value={c.owner?.id ?? ""}
                  onValueChange={(v) => v && reassign.mutate(v)}
                  disabled={reassign.isPending || users.isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    {(users.data ?? []).map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name ?? u.id.slice(0, 8)}
                        {u.id === me.data?.userId ? " (me)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="text-sm">
                {c.owner?.full_name ?? c.owner?.email ?? (
                  <span className="text-muted-foreground italic">Unassigned</span>
                )}
              </div>
            )}
          </Card>

          {c.company && (
            <Card className="border-border p-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Building2 className="size-4" />
                Company
              </h2>
              <button
                type="button"
                onClick={() => c.company_id && peek("company", c.company_id)}
                className="block text-left w-full group"
              >
                <div className="font-medium group-hover:text-primary transition-colors">
                  {c.company.name}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {c.company.domain ?? "—"}
                </div>
                {c.company.location && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {c.company.location}
                  </div>
                )}
                {c.company.industry && (
                  <Badge variant="outline" className="mt-2 text-[10px]">
                    {c.company.industry}
                  </Badge>
                )}
              </button>
            </Card>
          )}

          <Card className="border-border p-5">
            <h2 className="text-sm font-semibold mb-3">Purchases</h2>
            <ul className="space-y-2">
              {data.purchases.map((p: any) => (
                <li key={p.id} className="flex items-center justify-between text-sm">
                  <span>{p.product ?? "Purchase"}</span>
                  <span className="font-mono tabular-nums text-primary">
                    {fmt(Number(p.amount))}
                  </span>
                </li>
              ))}
              {data.purchases.length === 0 && (
                <li className="text-sm text-muted-foreground">No purchases yet.</li>
              )}
            </ul>
          </Card>

          <Card className="border-border p-5">
            <h2 className="text-sm font-semibold mb-3">Deals</h2>
            <ul className="space-y-2">
              {data.deals.map((d: any) => (
                <li key={d.id} className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => peek("deal", d.id)}
                    className="truncate text-left hover:text-primary"
                  >
                    {d.name}
                  </button>
                  <Badge variant="outline" className="capitalize text-[10px]">
                    {d.stage}
                  </Badge>
                </li>
              ))}
              {data.deals.length === 0 && (
                <li className="text-sm text-muted-foreground">No deals.</li>
              )}
            </ul>
          </Card>
        </div>
      </div>

      {c.notes && (
        <Card className="border-border p-5">
          <h2 className="text-sm font-semibold mb-2">Notes</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{c.notes}</p>
        </Card>
      )}
    </div>
  );
}
