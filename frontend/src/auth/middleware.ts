// Client-safe entry: no top-level imports of server-only modules.
// `.server()` body runs only on the server; dynamic-imports stay out of the client bundle.
import { createMiddleware } from "@tanstack/react-start";

export const AUTH_COOKIE = "ctv_auth";

export function isAdminOrManager(role: string | undefined): boolean {
  return role === "admin" || role === "manager";
}

export interface AuthContext {
  userId: string;
  email: string | null;
  role: "admin" | "manager" | "rep";
  currentOrgId: string | null;
  isSuperAdmin: boolean;
}

// Reusable resolver shared by the TanStack server-fn middleware and the
// /api/v1/* REST handlers. Accepts either:
//   - the ctv_auth cookie (browser, server-fn path)
//   - Authorization: Bearer <jwt> header (agent worker / service-to-service)
// Returns null on missing/invalid auth so callers can shape their own 401.
export async function resolveAuthFromRequest(request: Request): Promise<AuthContext | null> {
  const { verifyJwt } = await import("./crypto");
  const { getEnv } = await import("@/db/env.server");

  let token: string | null = null;

  // Bearer header path (preferred for service-to-service callers).
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (auth) {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match) token = match[1].trim();
  }

  // Cookie fallback (browser path).
  if (!token) {
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      for (const part of cookieHeader.split(/;\s*/)) {
        const eq = part.indexOf("=");
        if (eq === -1) continue;
        if (part.slice(0, eq).trim() === AUTH_COOKIE) {
          token = decodeURIComponent(part.slice(eq + 1).trim());
          break;
        }
      }
    }
  }

  if (!token) return null;

  // API-key path — opaque `crema_sk_…` bearer tokens minted on the CLI / API
  // settings page. Resolved against the api_keys table rather than the JWT.
  if (token.startsWith("crema_sk_")) {
    const { resolveApiKeyAuth } = await import("@/lib/api-keys.server");
    return resolveApiKeyAuth(token);
  }

  const payload = await verifyJwt(token, getEnv().JWT_SECRET);
  if (!payload) return null;
  return {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    currentOrgId: payload.current_org_id ?? null,
    isSuperAdmin: payload.is_super_admin === true,
  };
}

export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const request = getRequest();
  if (!request?.headers) throw new Error("Unauthorized: no request");
  const ctx = await resolveAuthFromRequest(request);
  if (!ctx) throw new Error("Unauthorized");
  return next({ context: ctx });
});
