import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { ErrorBody } from "@crema/shared";
import * as db from "../db";
import type { Env } from "../index";
import type { RepIdentity } from "../auth";
import { errorBody } from "./_util";

type AppEnv = { Bindings: Env; Variables: { rep: RepIdentity } };

const Me = z
  .object({
    id: z.string(),
    email: z.email(),
    name: z.string(),
    wsHint: z.string().openapi({
      description: "Path to upgrade to the rep's RepAgent DO. Append ?token=<jwt>.",
    }),
  })
  .openapi("Me");

const MeDashboard = z
  .object({
    repId: z.string(),
    openTickets: z.number().int().nonnegative(),
    openLeads: z.number().int().nonnegative(),
    customers: z.number().int().nonnegative(),
  })
  .openapi("MeDashboard");

const MeSummaryToday = z
  .object({
    markdown: z.string(),
  })
  .openapi("MeSummaryToday");

const meRoute = createRoute({
  method: "get",
  path: "/v1/me",
  tags: ["me"],
  summary: "Current sales rep",
  responses: {
    200: {
      description: "Current rep identity + WS hint",
      content: { "application/json": { schema: Me } },
    },
  },
});

const dashboardRoute = createRoute({
  method: "get",
  path: "/v1/me/dashboard",
  tags: ["me"],
  summary: "Rep dashboard counters",
  responses: {
    200: {
      description: "Real aggregate counters from D1",
      content: { "application/json": { schema: MeDashboard } },
    },
  },
});

const summaryRoute = createRoute({
  method: "get",
  path: "/v1/me/summary/today",
  tags: ["me"],
  summary: "Today's Morning Cup summary",
  responses: {
    200: {
      description: "Markdown summary from the rep's RepAgent DO",
      content: { "application/json": { schema: MeSummaryToday } },
    },
    404: {
      description: "No summary available",
      content: { "application/json": { schema: ErrorBody } },
    },
  },
});

export const meRoutes = new OpenAPIHono<AppEnv>();

meRoutes.openapi(meRoute, (c) => {
  const rep = c.get("rep");
  return c.json(
    {
      id: rep.repId,
      email: rep.email,
      name: rep.repId === "rep_demo" ? "Demo Rep" : rep.repId,
      wsHint: "/v1/agent",
    },
    200,
  );
});

meRoutes.openapi(dashboardRoute, async (c) => {
  const rep = c.get("rep");
  const counts = await db.dashboardCounters(c.env, rep.repId);
  return c.json({ repId: rep.repId, ...counts }, 200);
});

meRoutes.openapi(summaryRoute, async (c) => {
  const rep = c.get("rep");
  const id = c.env.AGENT.idFromName(rep.repId);
  const stub = c.env.AGENT.get(id);
  const res = await stub.fetch("http://internal/internal/summary/today");
  if (res.status === 404) {
    return c.json(errorBody("not_found", "no summary for today yet"), 404);
  }
  const body = (await res.json()) as { markdown: string };
  return c.json({ markdown: body.markdown }, 200);
});
