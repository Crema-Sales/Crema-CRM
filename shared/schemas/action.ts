import { z } from "@hono/zod-openapi";

export const ACTION_KINDS = ["lead", "ticket", "check_in"] as const;

export const ActionKind = z.enum(ACTION_KINDS).openapi("ActionKind");

export const PrioritizedAction = z
  .object({
    kind: ActionKind,
    customerId: z.string(),
    score: z.number().openapi({
      description:
        "Rank score = (open_tickets * 3) + lead_score + days_since_contact. Higher = more urgent.",
    }),
    reason: z.string().openapi({ description: "Human-readable rationale for the rank" }),
    dueAt: z.iso.datetime().nullable().optional(),
  })
  .openapi("PrioritizedAction");

export const ActionListResponse = z
  .object({
    items: z.array(PrioritizedAction),
  })
  .openapi("ActionListResponse");

export type PrioritizedAction = z.infer<typeof PrioritizedAction>;
export type ActionListResponse = z.infer<typeof ActionListResponse>;
export type ActionKind = z.infer<typeof ActionKind>;
