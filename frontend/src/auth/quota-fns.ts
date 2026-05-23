// Server-fns for per-rep quotas. The Org Settings members editor and the
// rep dashboard both consume this surface.
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { authPayloadFromCookieHeader } from "./cookies.server";
import { isMember, listMembers } from "@/lib/orgs.server";
import {
  clearUserQuota,
  quotaSnapshot,
  setUserQuota,
  type QuotaSnapshot,
} from "@/lib/quotas.server";

async function requireSession() {
  const req = getRequest();
  const payload = await authPayloadFromCookieHeader(req?.headers?.get("cookie"));
  if (!payload) {
    setResponseStatus(401);
    throw new Error("Unauthorized");
  }
  return payload;
}

export const getMyQuota = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  if (!session.current_org_id) {
    // No org → no quota. Mirrors the empty-snapshot shape so callers don't
    // branch on null vs. zeroed.
    return {
      quota: null,
      period: null,
      attained: { amount: 0, deal_count: 0 },
      pipeline: { amount: 0, deal_count: 0 },
      forecast: { amount: 0 },
    } satisfies QuotaSnapshot;
  }
  return await quotaSnapshot(session.current_org_id, session.sub);
});

export const listOrgQuotas = createServerFn({ method: "GET" })
  .inputValidator((d: { org_id: string }) =>
    z.object({ org_id: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (!(await isMember(data.org_id, session.sub))) {
      throw new Error("You are not a member of that organization");
    }
    const members = await listMembers(data.org_id);
    // Sequential to stay friendly to D1's connection budget at 5-person
    // scale; if this grows, batch via a single aggregate query.
    const rows = [];
    for (const m of members) {
      const snap = await quotaSnapshot(data.org_id, m.user_id);
      rows.push({ user_id: m.user_id, ...snap });
    }
    return rows;
  });

export const setMemberQuota = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      org_id: string;
      user_id: string;
      amount: number;
      period_type: "monthly" | "quarterly";
    }) =>
      z
        .object({
          org_id: z.string().min(1),
          user_id: z.string().min(1),
          amount: z.number().nonnegative(),
          period_type: z.enum(["monthly", "quarterly"]),
        })
        .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (!(await isMember(data.org_id, session.sub))) {
      throw new Error("You are not a member of that organization");
    }
    if (!(await isMember(data.org_id, data.user_id))) {
      throw new Error("That user is not a member of this organization");
    }
    return await setUserQuota({
      orgId: data.org_id,
      userId: data.user_id,
      amount: data.amount,
      periodType: data.period_type,
      createdBy: session.sub,
    });
  });

export const clearMemberQuota = createServerFn({ method: "POST" })
  .inputValidator((d: { org_id: string; user_id: string }) =>
    z
      .object({
        org_id: z.string().min(1),
        user_id: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (!(await isMember(data.org_id, session.sub))) {
      throw new Error("You are not a member of that organization");
    }
    await clearUserQuota(data.org_id, data.user_id);
    return { ok: true };
  });
