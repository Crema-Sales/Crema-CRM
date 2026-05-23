import { z } from "@hono/zod-openapi";

export const TICKET_STATUSES = ["open", "pending", "closed"] as const;
export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const TicketStatus = z.enum(TICKET_STATUSES).openapi("TicketStatus");
export const TicketPriority = z.enum(TICKET_PRIORITIES).openapi("TicketPriority");

export const Ticket = z
  .object({
    id: z.string().openapi({ example: "tkt_01HQK9..." }),
    customerId: z.string(),
    status: TicketStatus,
    priority: TicketPriority,
    slaBreached: z.boolean(),
    summary: z.string().min(1),
    openedAt: z.iso.datetime(),
    closedAt: z.iso.datetime().nullable().optional(),
  })
  .openapi("Ticket");

export const TicketPatch = Ticket.pick({
  status: true,
  priority: true,
  slaBreached: true,
  summary: true,
  closedAt: true,
})
  .partial()
  .openapi("TicketPatch");

export const TicketListQuery = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    status: TicketStatus.optional(),
  })
  .openapi("TicketListQuery");

export const TicketListResponse = z
  .object({
    items: z.array(Ticket),
    next_cursor: z.string().nullable(),
  })
  .openapi("TicketListResponse");

export type Ticket = z.infer<typeof Ticket>;
export type TicketPatch = z.infer<typeof TicketPatch>;
export type TicketListQuery = z.infer<typeof TicketListQuery>;
export type TicketListResponse = z.infer<typeof TicketListResponse>;
export type TicketStatus = z.infer<typeof TicketStatus>;
export type TicketPriority = z.infer<typeof TicketPriority>;
