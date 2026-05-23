import { z } from "@hono/zod-openapi";

export const LEAD_STAGES = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
] as const;

export const LeadStage = z.enum(LEAD_STAGES).openapi("LeadStage");

export const Lead = z
  .object({
    id: z.string().openapi({ example: "lead_01HQK9..." }),
    customerId: z.string(),
    stage: LeadStage,
    ltvEstimate: z.number().nonnegative().openapi({ description: "Estimated lifetime value in USD" }),
    ownerId: z.string().openapi({ description: "sales_rep_id" }),
    createdAt: z.iso.datetime(),
  })
  .openapi("Lead");

export const LeadPatch = Lead.pick({
  stage: true,
  ltvEstimate: true,
  ownerId: true,
})
  .partial()
  .openapi("LeadPatch");

export const LeadListQuery = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    stage: LeadStage.optional(),
  })
  .openapi("LeadListQuery");

export const LeadListResponse = z
  .object({
    items: z.array(Lead),
    next_cursor: z.string().nullable(),
  })
  .openapi("LeadListResponse");

export const LeadDraft = z
  .object({
    leadId: z.string(),
    draftText: z.string(),
    generatedAt: z.iso.datetime(),
  })
  .openapi("LeadDraft");

export type Lead = z.infer<typeof Lead>;
export type LeadPatch = z.infer<typeof LeadPatch>;
export type LeadListQuery = z.infer<typeof LeadListQuery>;
export type LeadListResponse = z.infer<typeof LeadListResponse>;
export type LeadDraft = z.infer<typeof LeadDraft>;
export type LeadStage = z.infer<typeof LeadStage>;
