import { z } from "@hono/zod-openapi";

export const ACTIVITY_TYPES = [
  "note",
  "email",
  "call",
  "page_view",
  "ingest",
  "agent_action",
] as const;

export const ACTIVITY_SOURCES = ["ui", "agent", "ingest"] as const;

export const ActivityType = z.enum(ACTIVITY_TYPES).openapi("ActivityType");
export const ActivitySource = z.enum(ACTIVITY_SOURCES).openapi("ActivitySource");

export const Activity = z
  .object({
    id: z.string().openapi({ example: "act_01HQK9..." }),
    customerId: z.string(),
    type: ActivityType,
    body: z.string(),
    source: ActivitySource,
    actorId: z.string().openapi({
      description: "sales_rep_id, agent id, or ingest source name",
    }),
    createdAt: z.iso.datetime(),
  })
  .openapi("Activity");

export const ActivityListQuery = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    type: ActivityType.optional(),
  })
  .openapi("ActivityListQuery");

export const ActivityListResponse = z
  .object({
    items: z.array(Activity),
    next_cursor: z.string().nullable(),
  })
  .openapi("ActivityListResponse");

export const ActivityNoteCreate = z
  .object({
    body: z.string().min(1),
  })
  .openapi("ActivityNoteCreate");

export type Activity = z.infer<typeof Activity>;
export type ActivityListQuery = z.infer<typeof ActivityListQuery>;
export type ActivityListResponse = z.infer<typeof ActivityListResponse>;
export type ActivityNoteCreate = z.infer<typeof ActivityNoteCreate>;
export type ActivityType = z.infer<typeof ActivityType>;
export type ActivitySource = z.infer<typeof ActivitySource>;
