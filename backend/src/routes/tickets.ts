import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  ErrorBody,
  Ticket,
  TicketListQuery,
  TicketListResponse,
  TicketPatch,
} from "@crema/shared";
import * as db from "../db";
import type { Env } from "../index";
import { errorBody } from "./_util";

const TicketIdParam = z.object({
  id: z
    .string()
    .openapi({ param: { name: "id", in: "path" }, example: "tkt_001" }),
});

const listRoute = createRoute({
  method: "get",
  path: "/v1/tickets",
  tags: ["tickets"],
  summary: "List tickets (paginated, filterable by status)",
  request: { query: TicketListQuery },
  responses: {
    200: {
      description: "Paginated ticket list",
      content: { "application/json": { schema: TicketListResponse } },
    },
  },
});

const patchRoute = createRoute({
  method: "patch",
  path: "/v1/tickets/{id}",
  tags: ["tickets"],
  summary: "Partial update of a ticket (status, priority, sla flag, summary, closedAt)",
  request: {
    params: TicketIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: TicketPatch } },
    },
  },
  responses: {
    200: {
      description: "Updated ticket",
      content: { "application/json": { schema: Ticket } },
    },
    404: {
      description: "Ticket not found",
      content: { "application/json": { schema: ErrorBody } },
    },
    422: {
      description: "Validation failed",
      content: { "application/json": { schema: ErrorBody } },
    },
  },
});

export const ticketRoutes = new OpenAPIHono<{ Bindings: Env }>();

ticketRoutes.openapi(listRoute, async (c) => {
  const { cursor, limit, status } = c.req.valid("query");
  const page = await db.listTickets(c.env, { cursor, limit, status });
  return c.json(page, 200);
});

ticketRoutes.openapi(patchRoute, async (c) => {
  const { id } = c.req.valid("param");
  const patch = c.req.valid("json");
  const updated = await db.patchTicket(c.env, id, patch);
  if (!updated) {
    return c.json(errorBody("not_found", `ticket ${id} not found`), 404);
  }
  return c.json(updated, 200);
});
