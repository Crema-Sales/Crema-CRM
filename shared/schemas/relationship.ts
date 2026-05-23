import { z } from "@hono/zod-openapi";

// Six-state taxonomy locked in 0008. `new` and `stale` are off-funnel
// (0 cups). `lead`/`discovery`/`budget_confirmed` map to cups 1/2/3.
// `customer` is post-funnel (set when any attached deal reaches `won`).
// Deal-stage cups (4-8) are derived from `deals.stage` in app code.
export const RELATIONSHIP_STATUSES = [
  "new",
  "stale",
  "lead",
  "discovery",
  "budget_confirmed",
  "customer",
] as const;

export const RelationshipStatus = z.enum(RELATIONSHIP_STATUSES).openapi("RelationshipStatus");

export const Relationship = z
  .object({
    id: z.string().openapi({ example: "rel_01HQK9..." }),
    org_id: z.string().nullable(),
    name: z.string().nullable(),
    status: RelationshipStatus,
    status_entered_at: z.iso.datetime(),
    owner_id: z.string().nullable(),
    notes: z.string().nullable(),
    archived_at: z.iso.datetime().nullable(),
    created_at: z.iso.datetime(),
  })
  .openapi("Relationship");

export const RelationshipCreate = z
  .object({
    name: z.string().min(1).max(200).optional(),
    status: RelationshipStatus.optional(),
    owner_id: z.string().uuid().nullable().optional(),
    notes: z.string().nullable().optional(),
    initial_contact_id: z.string().uuid().optional(),
    initial_company_id: z.string().uuid().optional(),
  })
  .openapi("RelationshipCreate");

export const RelationshipPatch = z
  .object({
    name: z.string().min(1).max(200).nullable().optional(),
    status: RelationshipStatus.optional(),
    owner_id: z.string().uuid().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .openapi("RelationshipPatch");

export const RelationshipContactAttach = z
  .object({
    relationship_id: z.string().uuid(),
    contact_id: z.string().uuid(),
    role: z.string().max(64).optional(),
    is_primary: z.boolean().optional(),
  })
  .openapi("RelationshipContactAttach");

export const RelationshipCompanyAttach = z
  .object({
    relationship_id: z.string().uuid(),
    company_id: z.string().uuid(),
    role: z.string().max(64).optional(),
    is_primary: z.boolean().optional(),
  })
  .openapi("RelationshipCompanyAttach");

export type Relationship = z.infer<typeof Relationship>;
export type RelationshipCreate = z.infer<typeof RelationshipCreate>;
export type RelationshipPatch = z.infer<typeof RelationshipPatch>;
export type RelationshipContactAttach = z.infer<typeof RelationshipContactAttach>;
export type RelationshipCompanyAttach = z.infer<typeof RelationshipCompanyAttach>;
export type RelationshipStatus = z.infer<typeof RelationshipStatus>;
