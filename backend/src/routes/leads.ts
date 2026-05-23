import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  ErrorBody,
  Lead,
  LeadDraft,
  LeadListQuery,
  LeadListResponse,
  LeadPatch,
} from "@crema/shared";
import * as db from "../db";
import type { Env } from "../index";
import { errorBody } from "./_util";

const LeadIdParam = z.object({
  id: z
    .string()
    .openapi({ param: { name: "id", in: "path" }, example: "lead_001" }),
});

const listRoute = createRoute({
  method: "get",
  path: "/v1/leads",
  tags: ["leads"],
  summary: "List leads (paginated, filterable by stage)",
  request: { query: LeadListQuery },
  responses: {
    200: {
      description: "Paginated lead list",
      content: { "application/json": { schema: LeadListResponse } },
    },
  },
});

const patchRoute = createRoute({
  method: "patch",
  path: "/v1/leads/{id}",
  tags: ["leads"],
  summary: "Partial update of a lead (move stage, update LTV, reassign)",
  request: {
    params: LeadIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: LeadPatch } },
    },
  },
  responses: {
    200: {
      description: "Updated lead",
      content: { "application/json": { schema: Lead } },
    },
    404: {
      description: "Lead not found",
      content: { "application/json": { schema: ErrorBody } },
    },
    422: {
      description: "Validation failed",
      content: { "application/json": { schema: ErrorBody } },
    },
  },
});

const draftRoute = createRoute({
  method: "post",
  path: "/v1/leads/{id}/drafts",
  tags: ["leads"],
  summary: "Generate a follow-up draft (stub — Phase 04 wires the copilot)",
  request: { params: LeadIdParam },
  responses: {
    201: {
      description: "Generated draft",
      content: { "application/json": { schema: LeadDraft } },
    },
    404: {
      description: "Lead not found",
      content: { "application/json": { schema: ErrorBody } },
    },
  },
});

export const leadRoutes = new OpenAPIHono<{ Bindings: Env }>();

leadRoutes.openapi(listRoute, async (c) => {
  const { cursor, limit, stage } = c.req.valid("query");
  const page = await db.listLeads(c.env, { cursor, limit, stage });
  return c.json(page, 200);
});

leadRoutes.openapi(patchRoute, async (c) => {
  const { id } = c.req.valid("param");
  const patch = c.req.valid("json");
  const updated = await db.patchLead(c.env, id, patch);
  if (!updated) {
    return c.json(errorBody("not_found", `lead ${id} not found`), 404);
  }
  return c.json(updated, 200);
});

leadRoutes.openapi(draftRoute, async (c) => {
  const { id } = c.req.valid("param");
  const lead = await db.getLead(c.env, id);
  if (!lead) {
    return c.json(errorBody("not_found", `lead ${id} not found`), 404);
  }
  const draft = {
    leadId: id,
    draftText: `Hi — following up on our conversation about your ${lead.stage} stage opportunity. Wanted to check in on next steps and see if I can answer any questions about the $${lead.ltvEstimate.toLocaleString("en-US")} proposal. — Demo Rep`,
    generatedAt: new Date().toISOString(),
  };
  return c.json(draft, 201);
});
