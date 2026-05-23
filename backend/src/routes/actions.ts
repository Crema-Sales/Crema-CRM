import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { ActionListResponse } from "@crema/shared";
import * as db from "../db";
import type { Env } from "../index";
import type { RepIdentity } from "../auth";

type AppEnv = { Bindings: Env; Variables: { rep: RepIdentity } };

const listRoute = createRoute({
  method: "get",
  path: "/v1/actions",
  tags: ["actions"],
  summary: "Prioritized action list for the calling rep",
  responses: {
    200: {
      description:
        "Ranked list of leads, open tickets, and check-in nudges for the rep. Deterministic for a given rep across calls.",
      content: { "application/json": { schema: ActionListResponse } },
    },
  },
});

export const actionRoutes = new OpenAPIHono<AppEnv>();

actionRoutes.openapi(listRoute, async (c) => {
  const rep = c.get("rep");
  const items = await db.prioritizedActions(c.env, rep.repId);
  return c.json({ items }, 200);
});
