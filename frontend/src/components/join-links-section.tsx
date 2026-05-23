import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Check, Trash2 } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-current-org";
import {
  createOrgJoinLink,
  listOrgJoinLinks,
  revokeOrgJoinLink,
} from "@/auth/join-links-fns";

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never expires" },
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
] as const;
type ExpiryOption = (typeof EXPIRY_OPTIONS)[number]["value"];

function expiryToISO(opt: ExpiryOption): string | null {
  if (opt === "never") return null;
  const days = opt === "1d" ? 1 : opt === "7d" ? 7 : 30;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function JoinLinksSection() {
  const qc = useQueryClient();
  const { orgId } = useCurrentOrg();
  const listFn = useServerFn(listOrgJoinLinks);
  const createFn = useServerFn(createOrgJoinLink);
  const revokeFn = useServerFn(revokeOrgJoinLink);

  const linksQ = useQuery({
    enabled: !!orgId,
    queryKey: ["join-links", orgId],
    queryFn: () => listFn({ data: { org_id: orgId! } }),
  });

  const [maxUsesStr, setMaxUsesStr] = useState("");
  const [expiry, setExpiry] = useState<ExpiryOption>("7d");

  const createMut = useMutation({
    mutationFn: () => {
      const maxUses = maxUsesStr.trim() ? parseInt(maxUsesStr, 10) : null;
      return createFn({
        data: {
          org_id: orgId!,
          max_uses: maxUses && maxUses > 0 ? maxUses : null,
          expires_at: expiryToISO(expiry),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["join-links", orgId] });
      setMaxUsesStr("");
      toast.success("Invite link created — copy it from the list");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const revokeMut = useMutation({
    mutationFn: (linkId: string) =>
      revokeFn({ data: { org_id: orgId!, link_id: linkId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["join-links", orgId] });
      toast.success("Link revoked");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (!orgId) return null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const links = linksQ.data ?? [];

  return (
    <Card className="border-border p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Invite links</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Reusable, paste-anywhere links. Set a usage cap, an expiry, or both.
          Anyone who follows the link and signs in joins this org as a member.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Max uses</Label>
          <Input
            type="number"
            placeholder="∞"
            value={maxUsesStr}
            onChange={(e) => setMaxUsesStr(e.target.value)}
            min={1}
            className="w-24"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Expires</Label>
          <Select value={expiry} onValueChange={(v) => setExpiry(v as ExpiryOption)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
        >
          Create link
        </Button>
      </div>

      {links.length > 0 && (
        <div className="space-y-1.5">
          {links.map((l) => {
            const expired =
              l.expires_at && new Date(l.expires_at).getTime() < Date.now();
            const exhausted =
              l.max_uses !== null && l.use_count >= l.max_uses;
            const active = !l.revoked_at && !expired && !exhausted;
            return (
              <div
                key={l.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md border border-border"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[10px] truncate text-muted-foreground">
                    {origin}/invite-link/{l.token}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex gap-2 mt-0.5">
                    <span>
                      {l.use_count}
                      {l.max_uses !== null ? ` / ${l.max_uses}` : ""} uses
                    </span>
                    <span>·</span>
                    <span>
                      {l.expires_at
                        ? `expires ${new Date(l.expires_at).toLocaleDateString()}`
                        : "never expires"}
                    </span>
                    <span>·</span>
                    <span className={active ? "text-green-700" : "text-amber-700"}>
                      {l.revoked_at
                        ? "revoked"
                        : expired
                          ? "expired"
                          : exhausted
                            ? "exhausted"
                            : "active"}
                    </span>
                  </div>
                </div>
                <CopyButton value={`${origin}/invite-link/${l.token}`} />
                {!l.revoked_at && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => revokeMut.mutate(l.id)}
                    disabled={revokeMut.isPending}
                    aria-label="Revoke"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
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
  );
}
