// Shared helpers for OpenAPI stub routes: opaque cursors, simple paginate,
// and the canonical ErrorBody builder.
import type { ErrorCode } from "@crema/shared/types";

export function encodeCursor(offset: number): string {
  return btoa(JSON.stringify({ o: offset }));
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(atob(cursor)) as { o?: unknown };
    if (typeof parsed.o !== "number" || parsed.o < 0 || !Number.isFinite(parsed.o)) {
      return 0;
    }
    return Math.floor(parsed.o);
  } catch {
    return 0;
  }
}

export function paginate<T>(
  items: readonly T[],
  cursor: string | undefined,
  limit: number,
): { items: T[]; next_cursor: string | null } {
  const offset = decodeCursor(cursor);
  const slice = items.slice(offset, offset + limit);
  const nextOffset = offset + slice.length;
  const next_cursor = nextOffset < items.length ? encodeCursor(nextOffset) : null;
  return { items: slice, next_cursor };
}

export function errorBody(
  code: ErrorCode,
  message: string,
  details: unknown = null,
): { error: { code: ErrorCode; message: string; details: unknown } } {
  return { error: { code, message, details } };
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}
