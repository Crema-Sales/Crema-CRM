import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Copy, Check, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { getOrgDetails } from "@/auth/org-fns";
import {
  getDomainStatus,
  requestDomainVerification,
  verifyDomain,
  setDomainJoinEnabled,
} from "@/auth/domain-fns";

export function DomainVerificationSection() {
  const qc = useQueryClient();
  const { orgId } = useCurrentOrg();
  const statusFn = useServerFn(getDomainStatus);
  const requestFn = useServerFn(requestDomainVerification);
  const verifyFn = useServerFn(verifyDomain);
  const setEnabledFn = useServerFn(setDomainJoinEnabled);
  const detailsFn = useServerFn(getOrgDetails);

  // Pull members so we can derive the caller's role and gate admin actions.
  const detailsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["org-details", orgId],
    queryFn: () => detailsFn({ data: { org_id: orgId! } }),
  });

  const statusQ = useQuery({
    enabled: !!orgId,
    queryKey: ["domain-status", orgId],
    queryFn: () => statusFn({ data: { org_id: orgId! } }),
  });

  const [domainInput, setDomainInput] = useState("");

  const requestMut = useMutation({
    mutationFn: () =>
      requestFn({ data: { org_id: orgId!, domain: domainInput } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domain-status", orgId] });
      setDomainInput("");
      toast.success("Domain claim recorded — publish the TXT record next");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const verifyMut = useMutation({
    mutationFn: () => verifyFn({ data: { org_id: orgId! } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["domain-status", orgId] });
      if (res.verified) toast.success(`Verified ${res.domain}`);
      else
        toast.error(
          "TXT record didn't match. DNS changes can take a few minutes — try again shortly.",
        );
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const enableMut = useMutation({
    mutationFn: (next: boolean) =>
      setEnabledFn({ data: { org_id: orgId!, enabled: next } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domain-status", orgId] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (!orgId || !statusQ.data || !detailsQ.data) return null;

  // Server-fns enforce admin-only on mutations; a non-admin who hits one
  // gets a toast back. The read endpoint (getDomainStatus) accepts any
  // member, so the section renders for everyone.
  const status = statusQ.data;

  return (
    <Card className="border-border p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Domain auto-join</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Verify ownership of an email domain so new signups from that domain
          land in this organization automatically. DNS verification is a one-time
          TXT record; auto-join is a toggle you can flip on or off any time.
        </p>
      </div>

      {!status.domain && (
        <div className="space-y-2">
          <Label className="text-xs">Domain</Label>
          <div className="flex gap-2">
            <Input
              placeholder="acme.com"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={() => requestMut.mutate()}
              disabled={
                requestMut.isPending || domainInput.trim().length < 3
              }
            >
              Claim domain
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Free email providers (gmail, outlook, yahoo, etc.) can't be claimed.
          </p>
        </div>
      )}

      {status.domain && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{status.domain}</span>
            {status.verified_at ? (
              <span className="inline-flex items-center gap-1 text-xs text-green-700">
                <CheckCircle2 className="size-3.5" />
                verified {new Date(status.verified_at).toLocaleDateString()}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                <AlertCircle className="size-3.5" />
                pending DNS check
              </span>
            )}
          </div>

          {status.pending_txt && (
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2 text-xs">
              <p className="text-muted-foreground">
                Publish this TXT record at your DNS provider, then click
                "Check now."
              </p>
              <CopyRow label="Host" value={status.pending_txt.host} />
              <CopyRow label="Value" value={status.pending_txt.value} />
              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => verifyMut.mutate()}
                  disabled={verifyMut.isPending}
                >
                  <RefreshCw className="size-3.5 mr-1.5" />
                  Check now
                </Button>
              </div>
            </div>
          )}

          {status.verified_at && (
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-xs font-medium">Auto-join enabled</p>
                <p className="text-[11px] text-muted-foreground">
                  New signups from {status.domain} are added to this org as
                  members.
                </p>
              </div>
              <Switch
                checked={status.join_enabled}
                onCheckedChange={(v) => enableMut.mutate(v)}
                disabled={enableMut.isPending}
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground w-12 shrink-0">
        {label}
      </span>
      <Input readOnly value={value} className="flex-1 font-mono text-xs" />
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}
