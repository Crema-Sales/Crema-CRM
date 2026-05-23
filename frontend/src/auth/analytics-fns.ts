import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { authPayloadFromCookieHeader } from "./cookies.server";
import { getDB } from "@/db/env.server";

interface FunnelEventRow {
  id: string;
  event_name: string;
  anonymous_id: string;
  contact_id: string | null;
  contact_email: string | null;
  contact_name: string | null;
  url: string | null;
  path: string | null;
  referrer: string | null;
  occurred_at: string;
}

// One row per anonymous visitor that has resolved to a contact — the
// conversion story the Visitor Activity page leads with.
interface ConvertedVisitorRow {
  anonymous_id: string;
  contact_id: string;
  contact_email: string | null;
  contact_name: string;
  relationship_stage: string;
  first_seen: string;
  last_seen: string;
  identified_at: string;
  total_events: number;
  anon_touches: number;
}

async function requireOrgScopedSession() {
  const req = getRequest();
  const payload = await authPayloadFromCookieHeader(req?.headers?.get("cookie"));
  if (!payload) {
    setResponseStatus(401);
    throw new Error("Unauthorized");
  }
  if (!payload.current_org_id) {
    setResponseStatus(403);
    throw new Error("No organization selected");
  }
  return payload;
}

export const getTrafficOverview = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireOrgScopedSession();
  const db = getDB();
  const orgId = session.current_org_id!;

  const events = await db
    .prepare(
      `SELECT fe.id, fe.event_name, fe.anonymous_id, fe.contact_id, fe.url, fe.path,
              fe.referrer, fe.occurred_at,
              c.email AS contact_email, c.full_name AS contact_name
         FROM funnel_events fe
         LEFT JOIN contacts c ON c.id = fe.contact_id
        WHERE fe.org_id = ?
        ORDER BY fe.occurred_at DESC
        LIMIT 200`,
    )
    .bind(orgId)
    .all<FunnelEventRow>();

  const counts = await db
    .prepare(
      `SELECT event_name, COUNT(*) AS n
         FROM funnel_events
        WHERE org_id = ?
        GROUP BY event_name
        ORDER BY n DESC`,
    )
    .bind(orgId)
    .all<{ event_name: string; n: number }>();

  const totals = await db
    .prepare(
      `SELECT
          COUNT(*) AS events,
          COUNT(DISTINCT anonymous_id) AS visitors,
          COUNT(DISTINCT contact_id) AS identified,
          COUNT(DISTINCT CASE WHEN contact_id IS NOT NULL THEN anonymous_id END)
            AS converted
        FROM funnel_events
       WHERE org_id = ?`,
    )
    .bind(orgId)
    .first<{ events: number; visitors: number; identified: number; converted: number }>();

  // Visitors that turned into leads: every anonymous_id that has resolved to a
  // contact, with the full pre-identification journey rolled up. `anon_touches`
  // is how many events fired before `crema.identify()` connected them.
  const converted = await db
    .prepare(
      `SELECT
          fe.anonymous_id,
          conv.contact_id,
          c.email AS contact_email,
          c.full_name AS contact_name,
          c.relationship_stage,
          MIN(fe.occurred_at) AS first_seen,
          MAX(fe.occurred_at) AS last_seen,
          conv.identified_at,
          COUNT(*) AS total_events,
          SUM(CASE WHEN fe.occurred_at < conv.identified_at THEN 1 ELSE 0 END)
            AS anon_touches
         FROM funnel_events fe
         JOIN (
           SELECT anonymous_id,
                  MAX(contact_id) AS contact_id,
                  MIN(occurred_at) AS identified_at
             FROM funnel_events
            WHERE org_id = ? AND contact_id IS NOT NULL
            GROUP BY anonymous_id
         ) conv ON conv.anonymous_id = fe.anonymous_id
         JOIN contacts c ON c.id = conv.contact_id
        WHERE fe.org_id = ?
        GROUP BY fe.anonymous_id
        ORDER BY conv.identified_at DESC
        LIMIT 100`,
    )
    .bind(orgId, orgId)
    .all<ConvertedVisitorRow>();

  const topPaths = await db
    .prepare(
      `SELECT path, COUNT(*) AS n
         FROM funnel_events
        WHERE org_id = ? AND event_name = 'pageview' AND path IS NOT NULL
        GROUP BY path
        ORDER BY n DESC
        LIMIT 10`,
    )
    .bind(orgId)
    .all<{ path: string; n: number }>();

  return {
    events: events.results ?? [],
    counts: counts.results ?? [],
    topPaths: topPaths.results ?? [],
    converted: converted.results ?? [],
    totals: totals ?? { events: 0, visitors: 0, identified: 0, converted: 0 },
  };
});
