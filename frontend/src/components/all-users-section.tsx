// All-users admin panel (Settings → Organization). Lists every account in the
// system and lets a super admin reassign a user's organization with a single
// dropdown. Server-fns (listUsers / setUserOrg / listAllOrgs) are super-admin
// only — non-super-admins see the panel quietly disappear.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listUsers, setUserOrg, listAllOrgs } from "@/auth/org-fns";
import { getMe } from "@/lib/crm.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// Sentinel for the Select when a user belongs to no org — Select needs a
// non-empty value, and this is never sent to the server (the onValueChange
// guard drops it).
const NO_ORG = "__none__";

export function AllUsersSection() {
  const qc = useQueryClient();
  const usersFn = useServerFn(listUsers);
  const orgsFn = useServerFn(listAllOrgs);
  const setOrgFn = useServerFn(setUserOrg);
  const meFn = useServerFn(getMe);

  const usersQ = useQuery({ queryKey: ["all-users"], queryFn: () => usersFn() });
  const orgsQ = useQuery({ queryKey: ["all-orgs"], queryFn: () => orgsFn() });
  const meQ = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const myUserId = meQ.data?.userId ?? null;

  const [query, setQuery] = useState("");

  const setMut = useMutation({
    mutationFn: (v: { user_id: string; org_id: string }) => setOrgFn({ data: v }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["all-users"] });
      qc.invalidateQueries({ queryKey: ["all-orgs"] });
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
      qc.invalidateQueries({ queryKey: ["org-details"] });
      toast.success(
        res.changed_self ? "You moved organizations" : "User organization updated",
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update"),
  });

  const filtered = useMemo(() => {
    const users = usersQ.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.full_name ?? "").toLowerCase().includes(q),
    );
  }, [usersQ.data, query]);

  // Non-super-admin viewers get a 403 from listUsers — render nothing in
  // that case so the panel just disappears from their settings page rather
  // than showing an error card.
  if (usersQ.error || orgsQ.error) return null;
  if (!usersQ.data || !orgsQ.data) return null;

  return (
    <Card className="border-border p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">All users</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Every account in the system. Pick an organization from the dropdown to
          reassign a user — it replaces their current membership.
        </p>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email…"
        className="text-xs"
      />

      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic">
            {query.trim()
              ? `No users match "${query.trim()}".`
              : "No users yet."}
          </p>
        )}
        {filtered.map((u) => {
          const currentOrgId = u.orgs[0]?.id ?? NO_ORG;
          const isSelf = u.user_id === myUserId;
          return (
            <div
              key={u.user_id}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-border"
            >
              <span className="flex-1 min-w-0 text-xs truncate">
                {u.full_name ? `${u.full_name} · ` : ""}
                <span className="text-muted-foreground">{u.email}</span>
                {isSelf && (
                  <span className="ml-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    you
                  </span>
                )}
                {u.orgs.length > 1 && (
                  <span
                    className="ml-2 font-mono text-[9px] uppercase tracking-widest text-amber-600"
                    title={u.orgs.map((o) => o.name).join(", ")}
                  >
                    {u.orgs.length} orgs
                  </span>
                )}
              </span>
              <Badge
                variant="outline"
                className="font-mono text-[10px] uppercase shrink-0"
              >
                {u.role}
              </Badge>
              <Select
                value={currentOrgId}
                disabled={setMut.isPending}
                onValueChange={(v) => {
                  if (v === NO_ORG || v === currentOrgId) return;
                  setMut.mutate({ user_id: u.user_id, org_id: v });
                }}
              >
                <SelectTrigger className="h-8 w-[180px] text-xs shrink-0">
                  <SelectValue placeholder="No organization" />
                </SelectTrigger>
                <SelectContent>
                  {currentOrgId === NO_ORG && (
                    <SelectItem value={NO_ORG} disabled>
                      No organization
                    </SelectItem>
                  )}
                  {orgsQ.data.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
