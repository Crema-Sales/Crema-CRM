import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { getOrgAuditLog } from "@/auth/org-fns";

// Friendlier renderings for the action codes server-side writes (see
// logAuditEvent call sites in org-fns.ts / domain-fns.ts / join-links-fns.ts).
const ACTION_LABELS: Record<string, string> = {
  "org.updated": "updated org settings",
  "org.stage_probability_changed": "changed a stage probability",
  "member.invited": "invited a teammate",
  "member.invite_revoked": "revoked an invitation",
  "member.removed": "removed a member",
  "member.self_left": "left the organization",
  "member.role_changed": "changed a member's role",
  "member.joined_via_link": "joined via an invite link",
  "member.moved_in": "moved into this org (super admin)",
  "member.moved_out": "moved out of this org (super admin)",
  "member.assigned_by_super_admin": "was assigned by a super admin",
  "domain.claim_requested": "claimed a domain",
  "domain.verified": "verified the domain",
  "domain.verification_failed": "DNS verification failed",
  "domain.join_enabled": "enabled domain auto-join",
  "domain.join_disabled": "disabled domain auto-join",
  "join_link.created": "created an invite link",
  "join_link.revoked": "revoked an invite link",
};

export function AuditLogSection() {
  const { orgId } = useCurrentOrg();
  const auditFn = useServerFn(getOrgAuditLog);

  const auditQ = useQuery({
    enabled: !!orgId,
    queryKey: ["audit-log", orgId],
    queryFn: () => auditFn({ data: { org_id: orgId!, limit: 100 } }),
  });

  if (!orgId) return null;
  // Non-admins get a 403 from the server-fn. Render nothing on error so the
  // section just disappears from their view rather than flashing an error.
  if (auditQ.error) return null;
  const rows = auditQ.data ?? [];

  return (
    <Card className="border-border p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Audit log</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Recent membership and settings changes. Read-only.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No activity yet.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((r) => {
            const label = ACTION_LABELS[r.action] ?? r.action;
            const actor = r.actor_email ?? "system";
            const target = r.target_email;
            return (
              <div
                key={r.id}
                className="flex items-baseline gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted/30"
              >
                <span className="font-mono text-[10px] text-muted-foreground shrink-0 w-32">
                  {new Date(r.created_at + "Z").toLocaleString()}
                </span>
                <span className="flex-1">
                  <span className="font-medium">{actor}</span>{" "}
                  <span className="text-muted-foreground">{label}</span>
                  {target && target !== actor && (
                    <>
                      {" "}
                      <span className="font-medium">{target}</span>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
