import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  listAllOrgs,
  getOrgDetails,
  updateOrg,
  inviteToOrg,
  removeOrgMember,
  revokeOrgInvitation,
  moveUserToOrg,
  setOrgMemberRole,
  signTrackingLink,
} from "@/auth/org-fns";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { getMe } from "@/lib/crm.functions";
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
import { Copy, Check, Trash2, KeyRound, ArrowRightLeft, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { sendPasswordResetForMember } from "@/auth/password-reset-fns";
import {
  METHODOLOGIES,
  METHODOLOGY_KEYS,
  type MethodologyKey,
} from "@/lib/sales-methodology";
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

export function OrgSettingsSection({ autofocus }: { autofocus?: "invite" } = {}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const inviteInputRef = useRef<HTMLInputElement | null>(null);
  const detailsFn = useServerFn(getOrgDetails);
  const updateFn = useServerFn(updateOrg);
  const inviteFn = useServerFn(inviteToOrg);
  const removeFn = useServerFn(removeOrgMember);
  const revokeFn = useServerFn(revokeOrgInvitation);
  const resetFn = useServerFn(sendPasswordResetForMember);
  const meFn = useServerFn(getMe);
  const allOrgsFn = useServerFn(listAllOrgs);
  const moveFn = useServerFn(moveUserToOrg);

  const { orgsQ, orgId } = useCurrentOrg();
  const meQ = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const myUserId = meQ.data?.userId ?? null;

  const detailsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["org-details", orgId],
    queryFn: () => detailsFn({ data: { org_id: orgId! } }),
  });

  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [methodology, setMethodology] = useState<MethodologyKey>("none");
  useEffect(() => {
    if (detailsQ.data?.org) {
      setName(detailsQ.data.org.name);
      setLogoUrl(detailsQ.data.org.logo_url ?? "");
      setMethodology(
        ((detailsQ.data.org as { sales_methodology?: string }).sales_methodology as MethodologyKey) ?? "none",
      );
    }
  }, [detailsQ.data?.org]);

  const saveMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          org_id: orgId!,
          name,
          logo_url: logoUrl.trim() || null,
          sales_methodology: methodology,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-details", orgId] });
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
      toast.success("Organization saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const [inviteEmail, setInviteEmail] = useState("");
  useEffect(() => {
    if (autofocus === "invite") {
      const t = window.setTimeout(() => {
        const el = inviteInputRef.current;
        if (!el) return;
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return () => window.clearTimeout(t);
    }
  }, [autofocus]);
  const inviteMut = useMutation({
    mutationFn: () => inviteFn({ data: { org_id: orgId!, email: inviteEmail } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-details", orgId] });
      setInviteEmail("");
      toast.success("Invitation created");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const revokeMut = useMutation({
    mutationFn: (invitationId: string) =>
      revokeFn({ data: { org_id: orgId!, invitation_id: invitationId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-details", orgId] });
      toast.success("Invitation revoked");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) =>
      removeFn({ data: { org_id: orgId!, user_id: userId } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["org-details", orgId] });
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
      if (res.removed_self) {
        toast.success("You left the organization");
        if (res.next_org_id) {
          // Drop the now-stale details cache and let the new org load.
          qc.removeQueries({ queryKey: ["org-details", orgId] });
        } else {
          navigate({ to: "/onboarding" });
        }
      } else {
        toast.success("Member removed");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const [pendingRemoval, setPendingRemoval] = useState<{
    user_id: string;
    label: string;
  } | null>(null);
  const [pendingReset, setPendingReset] = useState<{
    user_id: string;
    email: string;
  } | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    user_id: string;
    label: string;
  } | null>(null);
  const [moveTargetOrgId, setMoveTargetOrgId] = useState<string>("");

  const allOrgsQ = useQuery({
    enabled: !!pendingMove,
    queryKey: ["all-orgs"],
    queryFn: () => allOrgsFn(),
  });

  const moveMut = useMutation({
    mutationFn: (args: { user_id: string; to_org_id: string }) =>
      moveFn({
        data: {
          user_id: args.user_id,
          from_org_id: orgId!,
          to_org_id: args.to_org_id,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["org-details", orgId] });
      qc.invalidateQueries({ queryKey: ["org-details", res.to_org_id] });
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
      qc.invalidateQueries({ queryKey: ["all-orgs"] });
      if (res.moved_self) {
        toast.success("You moved to the selected organization");
      } else {
        toast.success("Member moved");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const resetMut = useMutation({
    mutationFn: (userId: string) =>
      resetFn({ data: { org_id: orgId!, user_id: userId } }),
    onSuccess: (res) => {
      toast.success(`Sent reset link to ${res.email}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const setRoleFn = useServerFn(setOrgMemberRole);
  const setRoleMut = useMutation({
    mutationFn: (args: { user_id: string; role: "owner" | "admin" | "member" }) =>
      setRoleFn({ data: { org_id: orgId!, ...args } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-details", orgId] });
      toast.success("Role updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (!orgsQ.data) return null;
  if (!orgId) {
    return (
      <Card className="border-border p-5 space-y-2">
        <h2 className="text-sm font-semibold">Organization</h2>
        <p className="text-xs text-muted-foreground">
          You're not in an organization yet. Visit the onboarding screen to create or join one.
        </p>
      </Card>
    );
  }
  if (!detailsQ.data) return null;

  const { members, invites } = detailsQ.data;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const myRole = members.find((m) => m.user_id === myUserId)?.role ?? null;
  const isAdmin = myRole === "admin" || myRole === "owner";
  const isOwner = myRole === "owner";

  return (
    <>
      <Card className="border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Organization</h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {members.length} {members.length === 1 ? "member" : "members"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div>
            <Label>Logo URL</Label>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…"
              maxLength={500}
            />
          </div>
        </div>

        <div>
          <Label>Sales methodology</Label>
          <Select value={methodology} onValueChange={(v) => setMethodology(v as MethodologyKey)}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHODOLOGY_KEYS.map((k) => (
                <SelectItem key={k} value={k}>
                  {METHODOLOGIES[k].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1.5">
            {METHODOLOGIES[methodology].tagline} · Individuals can override this on their profile.
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || name.trim().length === 0}
          >
            Save organization
          </Button>
        </div>
      </Card>

      <Card className="border-border p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Invite teammates</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Owners and admins can invite teammates, manage roles, and remove members. Regular members can update their own profile only.
          </p>
        </div>

        {isAdmin && (
          <div className="flex gap-2">
            <Input
              ref={inviteInputRef}
              type="email"
              placeholder="teammate@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1"
            />
            <Button
              size="sm"
              onClick={() => inviteMut.mutate()}
              disabled={inviteMut.isPending || inviteEmail.trim().length === 0}
            >
              Send invite
            </Button>
          </div>
        )}

        {invites.length > 0 && (
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Pending
            </p>
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/30"
              >
                <span className="flex-1 text-xs">{inv.email}</span>
                <CopyButton value={`${origin}/invite/${inv.token}`} />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => revokeMut.mutate(inv.id)}
                  disabled={revokeMut.isPending}
                  aria-label="Revoke"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {members.length > 0 && (
          <div className="space-y-1.5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Members
            </p>
            {members.map((m) => {
              const isSelf = m.user_id === myUserId;
              const label = m.full_name ? `${m.full_name} (${m.email})` : m.email;
              // Who can change this member's role?
              //   - Only admins or owners can change anyone's role.
              //   - An admin can't touch an owner.
              //   - Only an owner can grant or revoke `owner`.
              //   - Hide the control entirely if there's nothing the caller
              //     can do.
              const canChangeRole =
                isAdmin && (m.role !== "owner" || isOwner) && !setRoleMut.isPending;
              const allowedTargetRoles: ("owner" | "admin" | "member")[] = isOwner
                ? ["owner", "admin", "member"]
                : ["admin", "member"];
              return (
                <div
                  key={m.user_id}
                  className="flex items-center gap-2 px-3 py-2 rounded-md border border-border"
                >
                  <span className="flex-1 text-xs">
                    {m.full_name ? `${m.full_name} · ` : ""}
                    <span className="text-muted-foreground">{m.email}</span>
                    {isSelf && (
                      <span className="ml-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                        you
                      </span>
                    )}
                    {m.is_super_admin === 1 && (
                      <span className="ml-2 font-mono text-[9px] uppercase tracking-widest text-amber-700">
                        super admin
                      </span>
                    )}
                  </span>
                  {canChangeRole ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) =>
                        setRoleMut.mutate({
                          user_id: m.user_id,
                          role: v as "owner" | "admin" | "member",
                        })
                      }
                    >
                      <SelectTrigger className="h-7 w-[110px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {allowedTargetRoles.map((r) => (
                          <SelectItem key={r} value={r} className="text-xs">
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground w-[110px] text-center">
                      {m.role}
                    </span>
                  )}
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setPendingReset({ user_id: m.user_id, email: m.email })}
                      disabled={resetMut.isPending}
                      aria-label="Send password reset email"
                      title="Send password reset email"
                    >
                      <KeyRound className="size-3.5" />
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setMoveTargetOrgId("");
                        setPendingMove({ user_id: m.user_id, label });
                      }}
                      disabled={moveMut.isPending}
                      aria-label={isSelf ? "Move yourself to another org" : "Move to another org"}
                      title="Move to another organization"
                    >
                      <ArrowRightLeft className="size-3.5" />
                    </Button>
                  )}
                  {(isAdmin || isSelf) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setPendingRemoval({ user_id: m.user_id, label })}
                      disabled={removeMut.isPending}
                      aria-label={isSelf ? "Leave organization" : "Remove member"}
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

      <AlertDialog
        open={!!pendingReset}
        onOpenChange={(open) => {
          if (!open) setPendingReset(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send password reset email?</AlertDialogTitle>
            <AlertDialogDescription>
              We'll email <span className="font-mono">{pendingReset?.email}</span> a link
              to choose a new password. The link expires in 1 hour and can only be used
              once. Their current password keeps working until they reset it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingReset) {
                  resetMut.mutate(pendingReset.user_id);
                  setPendingReset(null);
                }
              }}
            >
              Send link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingMove}
        onOpenChange={(open) => {
          if (!open) {
            setPendingMove(null);
            setMoveTargetOrgId("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingMove?.user_id === myUserId
                ? "Move yourself to another organization?"
                : "Move member to another organization?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingMove?.user_id === myUserId ? (
                <>
                  You'll be removed from this organization and added to the one
                  you pick. Your active org context will switch immediately.
                </>
              ) : (
                <>
                  <span className="font-mono">{pendingMove?.label}</span> will be
                  removed from this organization and added to the one you pick.
                  Records they own stay in place.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-1">
            <Label className="text-xs">Target organization</Label>
            <Select
              value={moveTargetOrgId}
              onValueChange={setMoveTargetOrgId}
              disabled={allOrgsQ.isLoading}
            >
              <SelectTrigger className="mt-1">
                <SelectValue
                  placeholder={allOrgsQ.isLoading ? "Loading…" : "Pick an organization"}
                />
              </SelectTrigger>
              <SelectContent>
                {(allOrgsQ.data ?? [])
                  .filter((o) => o.id !== orgId)
                  .map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                        {o.member_count} {o.member_count === 1 ? "member" : "members"}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {allOrgsQ.data && allOrgsQ.data.filter((o) => o.id !== orgId).length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                No other organizations exist yet.
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!moveTargetOrgId || moveMut.isPending}
              onClick={() => {
                if (pendingMove && moveTargetOrgId) {
                  moveMut.mutate({
                    user_id: pendingMove.user_id,
                    to_org_id: moveTargetOrgId,
                  });
                  setPendingMove(null);
                  setMoveTargetOrgId("");
                }
              }}
            >
              Move
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingRemoval}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRemoval?.user_id === myUserId
                ? "Leave organization?"
                : "Remove member?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval?.user_id === myUserId
                ? "You'll lose access to this organization's data. You can be re-invited later."
                : `${pendingRemoval?.label ?? "This member"} will lose access immediately. Records they own stay in place.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRemoval) {
                  removeMut.mutate(pendingRemoval.user_id);
                  setPendingRemoval(null);
                }
              }}
            >
              {pendingRemoval?.user_id === myUserId ? "Leave" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function TrackingSnippetSection() {
  const detailsFn = useServerFn(getOrgDetails);
  const signLinkFn = useServerFn(signTrackingLink);
  const { orgsQ, orgId } = useCurrentOrg();
  const detailsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["org-details", orgId],
    queryFn: () => detailsFn({ data: { org_id: orgId! } }),
  });
  const [secretVisible, setSecretVisible] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [signedLink, setSignedLink] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  if (!orgsQ.data || !orgId || !detailsQ.data) return null;

  const { org } = detailsQ.data;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const snippetSrc = `${origin}/t/${org.tracking_guid}.js`;
  const snippet = `<script async src="${snippetSrc}"></script>`;

  async function onSignLink() {
    if (!orgId) return;
    setSignError(null);
    setSignedLink(null);
    setSigning(true);
    try {
      const result = await signLinkFn({
        data: { org_id: orgId, email: linkEmail.trim(), url: linkUrl.trim() },
      });
      setSignedLink(result.signed_url);
    } catch (e) {
      setSignError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigning(false);
    }
  }

  return (
    <Card className="border-border p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Tracking snippet</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Paste this on any web property you want Crema to track. Pageviews fire automatically;
          call <code className="font-mono">crema.track("event", &#123;…&#125;)</code> for custom
          events and <code className="font-mono">crema.identify(email, &#123;…&#125;)</code> when
          a visitor signs in or fills a form. See the{" "}
          <span className="text-foreground font-medium">Visitor Activity</span> help
          drawer for the full catalog of identification techniques.
        </p>
      </div>

      <div>
        <Label className="text-xs">Tracking GUID</Label>
        <CopyRow value={org.tracking_guid} mono />
      </div>

      <div>
        <Label className="text-xs">Script URL</Label>
        <CopyRow value={snippetSrc} mono />
      </div>

      <div>
        <Label className="text-xs">Copy &amp; paste snippet</Label>
        <CopyRow value={snippet} mono />
      </div>

      <div className="pt-2 border-t border-border space-y-3">
        <div>
          <Label className="text-xs">Tracking secret</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            HMAC key for signing <code className="font-mono">?crema_eid</code> auto-identify
            links. Keep this on your server — anyone with it can forge identity for visitors
            to your tracked sites.
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Input
              readOnly
              type={secretVisible ? "text" : "password"}
              value={org.tracking_secret}
              className="font-mono text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSecretVisible((v) => !v)}
              aria-label={secretVisible ? "Hide tracking secret" : "Show tracking secret"}
            >
              {secretVisible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </Button>
            <CopyButton value={org.tracking_secret} />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Sign a campaign link</Label>
          <p className="text-[11px] text-muted-foreground">
            Builds an auto-identify URL: when the recipient lands on the page, the snippet
            verifies the signature and resolves them to a contact without a form submit.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              placeholder="recipient@example.com"
              value={linkEmail}
              onChange={(e) => setLinkEmail(e.target.value)}
              className="text-xs"
            />
            <Input
              placeholder="https://yoursite.com/landing"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="text-xs"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!linkEmail.trim() || !linkUrl.trim() || signing}
            onClick={onSignLink}
          >
            {signing ? "Signing…" : "Sign link"}
          </Button>
          {signError ? (
            <p className="text-[11px] text-destructive">{signError}</p>
          ) : null}
          {signedLink ? (
            <div>
              <Label className="text-[11px]">Signed URL</Label>
              <CopyRow value={signedLink} mono />
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function CopyRow({ value, mono }: { value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2 mt-1">
      <Input readOnly value={value} className={mono ? "font-mono text-xs" : "text-xs"} />
      <CopyButton value={value} />
    </div>
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
