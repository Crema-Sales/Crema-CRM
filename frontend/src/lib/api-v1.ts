// Shared helpers for /api/v1/* REST handlers — the bearer-authed surface the
// agent worker (separate Cloudflare Worker) calls back into this CRM with the
// rep's purview. See AGENTS-API.md.

import { resolveAuthFromRequest, type AuthContext } from "@/auth/middleware";

const JSON_CT = { "Content-Type": "application/json" };

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...JSON_CT, ...corsHeaders(), ...(init.headers ?? {}) },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return jsonResponse({ error: { code, message } }, { status });
}

export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// Resolve the calling rep's context. Returns a 401 Response if the request
// lacks valid auth — callers should early-return that response.
export async function requireRestAuth(
  request: Request,
): Promise<{ ctx: AuthContext; error?: undefined } | { ctx?: undefined; error: Response }> {
  const ctx = await resolveAuthFromRequest(request);
  if (!ctx) {
    return { error: errorResponse(401, "unauthorized", "Missing or invalid auth") };
  }
  return { ctx };
}
