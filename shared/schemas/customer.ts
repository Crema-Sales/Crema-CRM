import { z } from "@hono/zod-openapi";

export const CUSTOMER_STATUSES = [
  "prospect",
  "active",
  "dormant",
  "churn_risk",
  "churned",
] as const;

export const CustomerStatus = z.enum(CUSTOMER_STATUSES).openapi("CustomerStatus");

export const Customer = z
  .object({
    id: z.string().openapi({ example: "cus_01HQK9..." }),
    name: z.string().min(1),
    email: z.email(),
    phone: z.string().nullable(),
    companyId: z.string().nullable().optional(),
    assignedTo: z.string().openapi({ description: "sales_rep_id" }),
    status: CustomerStatus,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("Customer");

export const CustomerCreate = Customer.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
  .partial({ phone: true, companyId: true, assignedTo: true, status: true })
  .openapi("CustomerCreate");

export const CustomerPatch = CustomerCreate.partial().openapi("CustomerPatch");

export const CustomerListQuery = z
  .object({
    cursor: z.string().optional().openapi({ description: "Opaque pagination cursor" }),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    q: z.string().optional().openapi({ description: "Free-text search across name + email" }),
    status: CustomerStatus.optional(),
  })
  .openapi("CustomerListQuery");

export const CustomerListResponse = z
  .object({
    items: z.array(Customer),
    next_cursor: z.string().nullable(),
  })
  .openapi("CustomerListResponse");

export type Customer = z.infer<typeof Customer>;
export type CustomerCreate = z.infer<typeof CustomerCreate>;
export type CustomerPatch = z.infer<typeof CustomerPatch>;
export type CustomerListQuery = z.infer<typeof CustomerListQuery>;
export type CustomerListResponse = z.infer<typeof CustomerListResponse>;
export type CustomerStatus = z.infer<typeof CustomerStatus>;
