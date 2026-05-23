// Shared read of the user's current organization. Every authed surface
// (sidebar, topbar, settings, org-scoped sections, palette switcher) was
// repeating the same `useQuery(["my-orgs"]) → current_org_id ?? orgs[0]`
// dance — this hook centralises it so the query key, fall-back, and
// caching policy stay aligned. All consumers share one cache entry and
// one network call.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyOrgs } from "@/auth/org-fns";

type OrgsQueryData = {
  current_org_id: string | null;
  orgs: Array<{ id: string; name: string; logo_url?: string | null }>;
};

export function useCurrentOrg() {
  const listFn = useServerFn(listMyOrgs);
  const orgsQ = useQuery({
    queryKey: ["my-orgs"],
    queryFn: () => listFn(),
    staleTime: 60_000,
  });
  const data = orgsQ.data as OrgsQueryData | undefined;
  const orgId = data?.current_org_id ?? data?.orgs[0]?.id ?? null;
  const org = orgId ? (data?.orgs.find((o) => o.id === orgId) ?? null) : null;
  const orgs = data?.orgs ?? [];
  return { orgsQ, orgId, org, orgs };
}
