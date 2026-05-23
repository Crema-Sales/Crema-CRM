import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  ActivityListResponse,
  ActivityNoteCreate,
  Customer,
  CustomerCreate,
  CustomerListQuery,
  CustomerListResponse,
  CustomerPatch,
  ErrorBody,
  Activity,
} from "@crema/shared";
import * as db from "../db";
import type { Env } from "../index";
import type { RepIdentity } from "../auth";
import { errorBody } from "./_util";

type AppEnv = { Bindings: Env; Variables: { rep: RepIdentity } };

const CustomerIdParam = z.object({
  id: z
    .string()
    .openapi({ param: { name: "id", in: "path" }, example: "cus_001" }),
});

const listRoute = createRoute({
  method: "get",
  path: "/v1/customers",
  tags: ["customers"],
  summary: "List customers (paginated)",
  request: { query: CustomerListQuery },
  responses: {
    200: {
      description: "Paginated customer list",
      content: { "application/json": { schema: CustomerListResponse } },
    },
  },
});

const createRouteDef = createRoute({
  method: "post",
  path: "/v1/customers",
  tags: ["customers"],
  summary: "Create a customer",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CustomerCreate } },
    },
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: Customer } },
    },
    422: {
      description: "Validation failed",
      content: { "application/json": { schema: ErrorBody } },
    },
  },
});

const readRoute = createRoute({
  method: "get",
  path: "/v1/customers/{id}",
  tags: ["customers"],
  summary: "Read one customer",
  request: { params: CustomerIdParam },
  responses: {
    200: {
      description: "Customer record",
      content: { "application/json": { schema: Customer } },
    },
    404: {
      description: "Customer not found",
      content: { "application/json": { schema: ErrorBody } },
    },
  },
});

const patchRoute = createRoute({
  method: "patch",
  path: "/v1/customers/{id}",
  tags: ["customers"],
  summary: "Partial update of a customer",
  request: {
    params: CustomerIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: CustomerPatch } },
    },
  },
  responses: {
    200: {
      description: "Updated customer",
      content: { "application/json": { schema: Customer } },
    },
    404: {
      description: "Customer not found",
      content: { "application/json": { schema: ErrorBody } },
    },
    422: {
      description: "Validation failed",
      content: { "application/json": { schema: ErrorBody } },
    },
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/v1/customers/{id}",
  tags: ["customers"],
  summary: "Soft delete a customer",
  request: { params: CustomerIdParam },
  responses: {
    204: { description: "Deleted (no content)" },
    404: {
      description: "Customer not found",
      content: { "application/json": { schema: ErrorBody } },
    },
  },
});

const timelineQuery = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  })
  .openapi("CustomerTimelineQuery");

const timelineRoute = createRoute({
  method: "get",
  path: "/v1/customers/{id}/timeline",
  tags: ["customers"],
  summary: "Activity timeline for a customer",
  request: { params: CustomerIdParam, query: timelineQuery },
  responses: {
    200: {
      description: "Paginated activity timeline (newest first)",
      content: { "application/json": { schema: ActivityListResponse } },
    },
    404: {
      description: "Customer not found",
      content: { "application/json": { schema: ErrorBody } },
    },
  },
});

const notesRoute = createRoute({
  method: "post",
  path: "/v1/customers/{id}/notes",
  tags: ["customers"],
  summary: "Append a manual note (creates an activity row)",
  request: {
    params: CustomerIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: ActivityNoteCreate } },
    },
  },
  responses: {
    201: {
      description: "Created activity row",
      content: { "application/json": { schema: Activity } },
    },
    404: {
      description: "Customer not found",
      content: { "application/json": { schema: ErrorBody } },
    },
    422: {
      description: "Validation failed",
      content: { "application/json": { schema: ErrorBody } },
    },
  },
});

export const customerRoutes = new OpenAPIHono<AppEnv>();

customerRoutes.openapi(listRoute, async (c) => {
  const { cursor, limit, q, status } = c.req.valid("query");
  const page = await db.listCustomers(c.env, { cursor, limit, q, status });
  return c.json(page, 200);
});

customerRoutes.openapi(createRouteDef, async (c) => {
  const body = c.req.valid("json");
  const rep = c.get("rep");
  const created = await db.createCustomer(c.env, body, rep.repId);
  return c.json(created, 201);
});

customerRoutes.openapi(readRoute, async (c) => {
  const { id } = c.req.valid("param");
  const found = await db.getCustomer(c.env, id);
  if (!found) {
    return c.json(errorBody("not_found", `customer ${id} not found`), 404);
  }
  return c.json(found, 200);
});

customerRoutes.openapi(patchRoute, async (c) => {
  const { id } = c.req.valid("param");
  const patch = c.req.valid("json");
  const updated = await db.patchCustomer(c.env, id, patch);
  if (!updated) {
    return c.json(errorBody("not_found", `customer ${id} not found`), 404);
  }
  return c.json(updated, 200);
});

customerRoutes.openapi(deleteRoute, async (c) => {
  const { id } = c.req.valid("param");
  const ok = await db.deleteCustomer(c.env, id);
  if (!ok) {
    return c.json(errorBody("not_found", `customer ${id} not found`), 404);
  }
  return c.body(null, 204);
});

customerRoutes.openapi(timelineRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { cursor, limit } = c.req.valid("query");
  const customer = await db.getCustomer(c.env, id);
  if (!customer) {
    return c.json(errorBody("not_found", `customer ${id} not found`), 404);
  }
  const page = await db.listTimeline(c.env, id, { cursor, limit });
  return c.json(page, 200);
});

// Live SSE stream for a customer. UI subscribes to update the timeline in
// real time when another tab, the cron, or the copilot mutates the record.
// Auth check: the rep must own the customer.
customerRoutes.get("/v1/customers/:id/events", async (c) => {
  const id = c.req.param("id");
  const rep = c.get("rep");
  const customer = await db.getCustomer(c.env, id);
  if (!customer) {
    return c.json(errorBody("not_found", `customer ${id} not found`), 404);
  }
  if (customer.assignedTo !== rep.repId) {
    return c.json(errorBody("forbidden", "not your customer"), 403);
  }
  const doId = c.env.CUSTOMER_STREAM.idFromName(id);
  return c.env.CUSTOMER_STREAM.get(doId).fetch("http://internal/subscribe");
});

customerRoutes.openapi(notesRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { body } = c.req.valid("json");
  const customer = await db.getCustomer(c.env, id);
  if (!customer) {
    return c.json(errorBody("not_found", `customer ${id} not found`), 404);
  }
  const rep = c.get("rep");
  const activity = await db.appendActivity(c.env, {
    customerId: id,
    type: "note",
    body,
    source: "ui",
    actorId: rep.repId,
  });
  return c.json(activity, 201);
});
