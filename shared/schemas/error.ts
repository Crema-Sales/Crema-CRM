import { z } from "@hono/zod-openapi";

export const ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_failed",
  "conflict",
  "rate_limited",
  "internal",
] as const;

export const ErrorCode = z.enum(ERROR_CODES).openapi("ErrorCode");

export const ErrorBody = z
  .object({
    error: z.object({
      code: ErrorCode,
      message: z.string(),
      details: z.unknown().nullable(),
    }),
  })
  .openapi("ErrorBody");

export type ErrorBody = z.infer<typeof ErrorBody>;
export type ErrorCode = z.infer<typeof ErrorCode>;
