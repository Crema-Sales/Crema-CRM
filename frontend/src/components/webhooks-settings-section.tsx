// Webhooks settings section — subscriptions list, recent deliveries, and a
// how-it-works explainer. Mounted by settings.tsx. Mirrors the visual treatment
// of org-settings-section.tsx (Card chrome, eyebrow line, muted-foreground
// helper copy). Phase 04 scaffolds the three Cards; subsequent sub-tasks fill
// in the Create/Edit, Reveal/Regenerate, and Send-test dialogs.
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import {
  MoreHorizontal,
  Pencil,
  Eye,
  RotateCcw,
  Send,
  Trash2,
  Plus,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";

import {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  listWebhookDeliveries,
  revealWebhookSecret,
  regenerateWebhookSecret,
  sendTestWebhook,
} from "@/lib/webhooks.functions";
import { parseEvents } from "@/lib/webhooks/types";
import { WEBHOOK_EVENT_GROUPS, type WebhookEvent } from "@/lib/webhooks/events";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Subscriptions come back with the secret stripped and a fingerprint added.
// Matches the redactSecret shape in webhooks.functions.ts.
type WebhookSubscription = Awaited<ReturnType<typeof listWebhooks>>[number];

// Mirrors the backend allow-list (webhooks.functions.ts → webhookUrl) so the
// dialog can give instant feedback before the round-trip.
const HTTP_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "webhook.site"];
function isValidWebhookUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return true;
  if (parsed.protocol !== "http:") return false;
  return HTTP_ALLOWED_HOSTS.some(
    (host) => parsed.hostname === host || parsed.hostname.startsWith(`${host}.`),
  );
}

const GROUP_LABELS: Record<string, string> = {
  contact: "Contacts",
  deal: "Deals",
  lead: "Leads",
  ticket: "Tickets",
  purchase: "Purchases",
};

type DialogState = { mode: "create" } | { mode: "edit"; sub: WebhookSubscription } | null;

// Surfaced after a successful create / reveal / regenerate. Title + description
// vary by source so the same one-time-secret modal can serve all three flows.
type RevealedSecret = { secret: string; title: string; description: string };

export function WebhooksSettingsSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWebhooks);
  const updateFn = useServerFn(updateWebhook);
  const deleteFn = useServerFn(deleteWebhook);
  const deliveriesFn = useServerFn(listWebhookDeliveries);
  const revealFn = useServerFn(revealWebhookSecret);
  const regenerateFn = useServerFn(regenerateWebhookSecret);

  const subsQ = useQuery({ queryKey: ["webhooks"], queryFn: () => listFn() });
  const deliveriesQ = useQuery({
    queryKey: ["webhook-deliveries", { limit: 25 }],
    queryFn: () => deliveriesFn({ data: { limit: 25 } }),
  });

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) =>
      updateFn({ data: { id: v.id, enabled: v.enabled } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Subscription updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      qc.invalidateQueries({ queryKey: ["webhook-deliveries", { limit: 25 }] });
      toast.success("Subscription deleted");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const [dialogState, setDialogState] = useState<DialogState>(null);
  // Single state for any one-time-secret modal (create / reveal / regenerate).
  // The secret is not stored on the client otherwise — once dismissed it's gone.
  const [revealedSecret, setRevealedSecret] = useState<RevealedSecret | null>(null);

  // Confirm-before-reveal guards against accidental on-camera leaks during the
  // demo shoot; regenerate's confirm warns receivers will start failing sig
  // checks. Both AlertDialogs default focus to Cancel (shadcn destructive idiom).
  const [revealConfirmId, setRevealConfirmId] = useState<string | null>(null);
  const [regenerateConfirmId, setRegenerateConfirmId] = useState<string | null>(null);
  // Holds the subscription whose Send-test dialog is open. Carrying the row
  // itself (not just the id) lets the dialog populate its event Select from the
  // row's `events` JSON without re-fetching.
  const [sendTestSub, setSendTestSub] = useState<WebhookSubscription | null>(null);

  const revealMut = useMutation({
    mutationFn: (id: string) => revealFn({ data: { id } }),
    onSuccess: (res) => {
      setRevealConfirmId(null);
      setRevealedSecret({
        secret: res.secret,
        title: "Webhook signing secret",
        description:
          "Copy and paste into your receiver's config. This is the value Crema uses to compute the HMAC signature.",
      });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const regenerateMut = useMutation({
    mutationFn: (id: string) => regenerateFn({ data: { id } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      setRegenerateConfirmId(null);
      setRevealedSecret({
        secret: res.secret,
        title: "New webhook signing secret",
        description:
          "The previous secret no longer works. Copy this one now and update your receiver — deliveries signed with the old secret will fail signature checks.",
      });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const subs = subsQ.data ?? [];
  const deliveries = deliveriesQ.data ?? [];
  const subById = new Map(subs.map((s) => [s.id, s]));

  return (
    <TooltipProvider delayDuration={150}>
      {/* Card 1 — Subscriptions list + Add button */}
      <Card className="border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Webhooks</h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            subscriptions · deliveries · slack
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Push CRM events to Slack, your own server, or any HTTPS endpoint. Receivers verify with
          HMAC-SHA256 over the timestamp and raw body.
        </p>

        {subs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No webhooks yet. Add one below.</p>
        ) : (
          <div className="space-y-1.5">
            {subs.map((sub) => {
              const events = parseEvents({ events: sub.events });
              const enabled = sub.enabled === 1;
              return (
                <div
                  key={sub.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium truncate">{sub.name}</span>
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {sub.format === "slack" ? "Slack" : "JSON"}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {events.length} {events.length === 1 ? "event" : "events"}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {/* tabIndex makes the span focusable so the full-URL
                              tooltip is reachable by keyboard (Radix Tooltip
                              opens on focus as well as hover). */}
                          <span
                            tabIndex={0}
                            className="font-mono truncate cursor-default rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Webhook URL: ${sub.url}`}
                          >
                            {truncateMid(sub.url, 50)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="font-mono text-[11px] max-w-[480px] break-all">
                          {sub.url}
                        </TooltipContent>
                      </Tooltip>
                      <LastDeliveryCell at={sub.last_delivery_at} status={sub.last_status} />
                    </div>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) => toggleMut.mutate({ id: sub.id, enabled: v })}
                    aria-label={`${enabled ? "Disable" : "Enable"} ${sub.name}`}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label={`Actions for ${sub.name}`}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[10rem]">
                      <DropdownMenuItem onSelect={() => setDialogState({ mode: "edit", sub })}>
                        <Pencil className="size-3.5" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setRevealConfirmId(sub.id)}>
                        <Eye className="size-3.5" /> Reveal secret
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setRegenerateConfirmId(sub.id)}>
                        <RotateCcw className="size-3.5" /> Regenerate secret
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setSendTestSub(sub)}>
                        <Send className="size-3.5" /> Send test
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setDeleteId(sub.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-3.5" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={() => setDialogState({ mode: "create" })}>
            <Plus className="size-3.5" /> Add webhook
          </Button>
        </div>
      </Card>

      {/* Card 2 — Recent deliveries */}
      <Card className="border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent deliveries</h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            last 25 across all subscriptions
          </span>
        </div>

        {deliveries.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No deliveries yet. Add a webhook and click <span className="font-mono">Send test</span>{" "}
            to verify.
          </p>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-[7rem_1fr_1fr_5rem_4rem_1rem] gap-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>When</span>
              <span>Event</span>
              <span>Subscription</span>
              <span>Status</span>
              <span className="text-right">ms</span>
              <span />
            </div>
            {deliveries.map((d) => (
              <DeliveryRow
                key={d.id}
                delivery={d}
                subscriptionName={subById.get(d.subscription_id)?.name ?? "—"}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Card 3 — How verification works */}
      <Card className="border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">How verification works</h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            hmac signing · slack preset
          </span>
        </div>

        <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
          <p>
            Every delivery is signed with HMAC-SHA256 over{" "}
            <code className="font-mono">{`${"<"}timestamp${">"}.${"<"}raw-body${">"}`}</code> using
            your subscription secret. The signature lands in the{" "}
            <code className="font-mono">x-crema-signature</code> header as{" "}
            <code className="font-mono">sha256=&lt;hex&gt;</code>, alongside{" "}
            <code className="font-mono">x-crema-event</code>,{" "}
            <code className="font-mono">x-crema-delivery-id</code>, and{" "}
            <code className="font-mono">x-crema-timestamp</code>. This matches GitHub's webhook spec
            — recipients recompute the HMAC and compare in constant time.
          </p>
          <p>
            <span className="text-foreground">Slack format</span> wraps the same event into Slack's
            block-kit message shape so you can paste a Slack incoming-webhook URL and see formatted
            messages immediately. Headers are still signed; Slack ignores them.
          </p>
          <div>
            <p className="mb-1">
              <span className="text-foreground">Verify a delivery server-side</span> (pseudocode):
            </p>
            <pre className="p-3 rounded-md bg-muted font-mono text-[11px] overflow-x-auto leading-relaxed text-foreground">{`ts   = req.headers["x-crema-timestamp"]
sig  = req.headers["x-crema-signature"]      // "sha256=<hex>"
mac  = hmac_sha256(secret, ts + "." + raw_body)
expected = "sha256=" + hex(mac)
if not constant_time_equal(expected, sig): reject
if abs(now() - int(ts)) > 300:               reject   // 5-min freshness window`}</pre>
          </div>
        </div>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              Receivers will stop getting events from this subscription. The delivery log stays.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel autoFocus>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) deleteMut.mutate(deleteId);
                setDeleteId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <WebhookFormDialog
        state={dialogState}
        onClose={() => setDialogState(null)}
        onCreated={(secret) =>
          setRevealedSecret({
            secret,
            title: "Copy your webhook secret",
            description:
              "This is the only time you'll see this secret. Copy it now — receivers use it to verify each delivery's HMAC signature.",
          })
        }
      />

      <SecretRevealedDialog
        secret={revealedSecret?.secret ?? null}
        title={revealedSecret?.title ?? ""}
        description={revealedSecret?.description ?? ""}
        onClose={() => setRevealedSecret(null)}
      />

      <AlertDialog
        open={!!revealConfirmId}
        onOpenChange={(o) => !o && !revealMut.isPending && setRevealConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Show this webhook's signing secret?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone with access to your screen will see it. Make sure you're not sharing or
              recording before continuing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel autoFocus disabled={revealMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (revealConfirmId) revealMut.mutate(revealConfirmId);
              }}
              disabled={revealMut.isPending}
            >
              {revealMut.isPending ? "Loading…" : "Show secret"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SendTestDialog
        sub={sendTestSub}
        onClose={() => setSendTestSub(null)}
        onSent={() => qc.invalidateQueries({ queryKey: ["webhook-deliveries", { limit: 25 }] })}
      />

      <AlertDialog
        open={!!regenerateConfirmId}
        onOpenChange={(o) => !o && !regenerateMut.isPending && setRegenerateConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate signing secret?</AlertDialogTitle>
            <AlertDialogDescription>
              This invalidates the current secret. Receivers using the old secret will start failing
              signature checks until they're updated with the new value.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel autoFocus disabled={regenerateMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (regenerateConfirmId) regenerateMut.mutate(regenerateConfirmId);
              }}
              disabled={regenerateMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {regenerateMut.isPending ? "Regenerating…" : "Regenerate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

function LastDeliveryCell({ at, status }: { at: string | null; status: number | null }) {
  if (!at) {
    return <span className="text-muted-foreground/60">no deliveries</span>;
  }
  const relative = formatDistanceToNow(new Date(at), { addSuffix: true });
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="text-muted-foreground/60">
        ·
      </span>
      <span>last {relative}</span>
      <StatusBadge status={status} />
    </span>
  );
}

function StatusBadge({ status }: { status: number | null }) {
  if (status == null) {
    return (
      <Badge variant="outline" className="font-mono text-[10px]">
        pending
      </Badge>
    );
  }
  const ok = status >= 200 && status < 300;
  return (
    <Badge variant={ok ? "default" : "destructive"} className="font-mono text-[10px]">
      {status}
    </Badge>
  );
}

function DeliveryRow({
  delivery,
  subscriptionName,
}: {
  delivery: {
    id: string;
    event: string;
    payload_json: string;
    status: number | null;
    response_snippet: string | null;
    duration_ms: number | null;
    succeeded: number;
    error: string | null;
    attempted_at: string;
  };
  subscriptionName: string;
}) {
  const [open, setOpen] = useState(false);
  const relative = formatDistanceToNow(new Date(delivery.attempted_at), { addSuffix: true });
  const pretty = (() => {
    try {
      return JSON.stringify(JSON.parse(delivery.payload_json), null, 2);
    } catch {
      return delivery.payload_json;
    }
  })();
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full grid grid-cols-[7rem_1fr_1fr_5rem_4rem_1rem] gap-2 px-3 py-2 rounded-md border border-border hover:bg-muted/40 transition-colors text-left items-center text-xs"
      >
        <span className="text-muted-foreground truncate">{relative}</span>
        <span className="font-mono truncate">{delivery.event}</span>
        <span className="truncate">{subscriptionName}</span>
        <span>
          <StatusBadge status={delivery.status} />
        </span>
        <span className="text-right font-mono text-[11px] text-muted-foreground">
          {delivery.duration_ms ?? "—"}
        </span>
        {open ? (
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
        )}
      </button>
      <CollapsibleContent>
        <div className="mt-1 mb-1 p-3 rounded-md bg-muted space-y-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              Request body
            </p>
            <pre className="font-mono text-[11px] overflow-x-auto leading-relaxed">{pretty}</pre>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              {delivery.error ? "Error" : "Response"}
            </p>
            <pre className="font-mono text-[11px] overflow-x-auto leading-relaxed whitespace-pre-wrap">
              {delivery.error ?? delivery.response_snippet ?? "(no response captured)"}
            </pre>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function truncateMid(s: string, max: number): string {
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return `${s.slice(0, half)}…${s.slice(-half)}`;
}

function WebhookFormDialog({
  state,
  onClose,
  onCreated,
}: {
  state: DialogState;
  onClose: () => void;
  onCreated: (secret: string) => void;
}) {
  const open = state !== null;
  const isEdit = state?.mode === "edit";
  const existing = isEdit ? state.sub : null;

  const qc = useQueryClient();
  const createFn = useServerFn(createWebhook);
  const updateFn = useServerFn(updateWebhook);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<"json" | "slack">("json");
  const [selectedEvents, setSelectedEvents] = useState<Set<WebhookEvent>>(new Set());
  const [enabled, setEnabled] = useState(true);

  // Re-prime fields whenever we open (create-blank, edit-from-row). Depending
  // on `existing` lets repeated Edit clicks on different rows refresh state.
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setName(existing.name);
      setUrl(existing.url);
      setFormat(existing.format);
      setSelectedEvents(new Set(parseEvents(existing)));
      setEnabled(existing.enabled === 1);
    } else {
      setName("");
      setUrl("");
      setFormat("json");
      setSelectedEvents(new Set());
      setEnabled(true);
    }
  }, [open, existing]);

  const trimmedName = name.trim();
  const trimmedUrl = url.trim();
  const urlError =
    trimmedUrl.length === 0
      ? null
      : !isValidWebhookUrl(trimmedUrl)
        ? "URL must be https://, or http://localhost / 127.0.0.1 / webhook.site for testing"
        : null;
  const nameError = trimmedName.length > 80 ? "Name must be 80 characters or fewer" : null;

  const canSubmit =
    trimmedName.length > 0 &&
    !nameError &&
    trimmedUrl.length > 0 &&
    !urlError &&
    selectedEvents.size > 0;

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          name: trimmedName,
          url: trimmedUrl,
          events: Array.from(selectedEvents),
          format,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook created");
      onClose();
      onCreated(res.secret);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id: existing!.id,
          name: trimmedName,
          url: trimmedUrl,
          events: Array.from(selectedEvents),
          format,
          enabled,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook updated");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const pending = createMut.isPending || updateMut.isPending;

  const toggleEvent = (ev: WebhookEvent) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(ev)) next.delete(ev);
      else next.add(ev);
      return next;
    });
  };

  const toggleGroup = (group: WebhookEvent[]) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      const allSelected = group.every((ev) => next.has(ev));
      if (allSelected) {
        for (const ev of group) next.delete(ev);
      } else {
        for (const ev of group) next.add(ev);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit webhook" : "New webhook"}</DialogTitle>
          <DialogDescription>
            Crema POSTs each event to your URL with an HMAC-signed body. Choose which events fire
            this subscription and how the payload is shaped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="wh-name">Name</Label>
            <Input
              id="wh-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Slack #revenue alerts"
            />
            {nameError && <p className="text-[11px] text-destructive">{nameError}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="wh-url">Target URL</Label>
            <Input
              id="wh-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/hooks/crm"
              className="font-mono text-xs"
            />
            {urlError && <p className="text-[11px] text-destructive">{urlError}</p>}
          </div>

          <div className="space-y-2">
            <Label>Format</Label>
            <RadioGroup
              value={format}
              onValueChange={(v) => setFormat(v as "json" | "slack")}
              className="gap-2"
            >
              <label
                htmlFor="wh-format-json"
                className="flex items-start gap-3 px-3 py-2 rounded-md border border-border cursor-pointer hover:bg-muted/40"
              >
                <RadioGroupItem value="json" id="wh-format-json" className="mt-0.5" />
                <span className="flex-1 text-xs">
                  <span className="font-medium">JSON envelope (Crema standard)</span>
                  <span className="block text-muted-foreground">
                    Generic envelope:{" "}
                    <code className="font-mono">{`{ id, event, org_id, occurred_at, data }`}</code>.
                    Use for your own services.
                  </span>
                </span>
              </label>
              <label
                htmlFor="wh-format-slack"
                className="flex items-start gap-3 px-3 py-2 rounded-md border border-border cursor-pointer hover:bg-muted/40"
              >
                <RadioGroupItem value="slack" id="wh-format-slack" className="mt-0.5" />
                <span className="flex-1 text-xs">
                  <span className="font-medium">Slack message blocks</span>
                  <span className="block text-muted-foreground">
                    Block-Kit shape ready to paste a Slack incoming-webhook URL. Headers stay signed
                    (Slack ignores them).
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Events</Label>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {selectedEvents.size} selected
              </span>
            </div>
            <div className="space-y-3 px-3 py-3 rounded-md border border-border">
              {Object.entries(WEBHOOK_EVENT_GROUPS).map(([groupKey, events]) => {
                const allSelected = events.every((ev) => selectedEvents.has(ev));
                return (
                  <div key={groupKey} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">
                        {GROUP_LABELS[groupKey] ?? groupKey}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleGroup(events)}
                        className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        {allSelected ? "Clear group" : "Select all"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {events.map((ev) => {
                        const id = `wh-ev-${ev}`;
                        return (
                          <label
                            key={ev}
                            htmlFor={id}
                            className="flex items-center gap-2 cursor-pointer text-xs"
                          >
                            <Checkbox
                              id={id}
                              checked={selectedEvents.has(ev)}
                              onCheckedChange={() => toggleEvent(ev)}
                            />
                            <span className="font-mono">{ev}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {selectedEvents.size === 0 && (
              <p className="text-[11px] text-muted-foreground">Select at least one event.</p>
            )}
          </div>

          {isEdit && (
            <div className="flex items-center justify-between px-3 py-2 rounded-md border border-border">
              <div>
                <Label htmlFor="wh-enabled" className="text-xs">
                  Enabled
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Disabled subscriptions skip delivery entirely (no row in the log).
                </p>
              </div>
              <Switch id="wh-enabled" checked={enabled} onCheckedChange={setEnabled} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => (isEdit ? updateMut.mutate() : createMut.mutate())}
            disabled={!canSubmit || pending}
          >
            {isEdit ? "Save changes" : "Create webhook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendTestDialog({
  sub,
  onClose,
  onSent,
}: {
  sub: WebhookSubscription | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const open = sub !== null;
  const sendFn = useServerFn(sendTestWebhook);
  const events = sub ? parseEvents(sub) : [];
  const [event, setEvent] = useState<WebhookEvent | null>(null);

  // Default the Select to the subscription's first event each time the dialog
  // opens; keying on sub.id makes repeated opens against different rows reset
  // cleanly without leaking a stale event into the next dialog instance.
  useEffect(() => {
    if (!open) {
      setEvent(null);
      return;
    }
    setEvent(events[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sub?.id]);

  const sendMut = useMutation({
    mutationFn: (v: { id: string; event: WebhookEvent }) =>
      sendFn({ data: { id: v.id, event: v.event } }),
    onSuccess: () => {
      toast.success("Test sent — see Recent deliveries below");
      onSent();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !sendMut.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send test delivery</DialogTitle>
          <DialogDescription>
            Crema will send a synthetic payload for the chosen event to{" "}
            <span className="font-mono">{sub?.name}</span>. The result lands in Recent deliveries —
            green for 2xx, red otherwise.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="wh-test-event">Event</Label>
          <Select
            value={event ?? undefined}
            onValueChange={(v) => setEvent(v as WebhookEvent)}
            disabled={sendMut.isPending || events.length === 0}
          >
            <SelectTrigger id="wh-test-event" className="font-mono text-xs">
              <SelectValue placeholder="Select an event" />
            </SelectTrigger>
            <SelectContent>
              {events.map((ev) => (
                <SelectItem key={ev} value={ev} className="font-mono text-xs">
                  {ev}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {events.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              This subscription has no events selected. Edit it to subscribe to at least one event
              before sending a test.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={sendMut.isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (sub && event) sendMut.mutate({ id: sub.id, event });
            }}
            disabled={!event || sendMut.isPending}
          >
            {sendMut.isPending ? "Sending…" : "Send test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SecretRevealedDialog({
  secret,
  title,
  description,
  onClose,
}: {
  secret: string | null;
  title: string;
  description: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!secret) setCopied(false);
  }, [secret]);
  return (
    <Dialog open={!!secret} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={secret ?? ""}
            className="font-mono text-xs"
            aria-label="Webhook signing secret"
          />
          <Button
            size="sm"
            variant="outline"
            aria-label={copied ? "Secret copied" : "Copy secret to clipboard"}
            onClick={() => {
              if (!secret) return;
              navigator.clipboard.writeText(secret);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
        <DialogFooter>
          <Button size="sm" onClick={onClose}>
            I've copied it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
