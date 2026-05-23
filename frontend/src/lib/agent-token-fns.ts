// Server-fn that exposes the signed-in user's ctv_auth JWT to the chat client.
//
// The cookie is HttpOnly so client JS can't read it directly. The chat WebSocket
// upgrade carries the token via `?token=` because browsers can't set headers on
// `new WebSocket(...)`. We hand the token to the client only after verifying it
// server-side — if the cookie is missing or invalid, returns nulls and the chat
// surfaces "please sign in again".
//
// Same JWT works on both Workers because backend/wrangler.toml's
// JWT_SIGNING_KEY is aligned with frontend's JWT_SECRET. No exchange route.

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authPayloadFromCookieHeader, readAuthCookie } from "@/auth/cookies.server";

export type AgentTokenResult =
  | { token: string; repId: string; email: string }
  | { token: null; repId: null; email: null };

export const getAgentToken = createServerFn({ method: "GET" }).handler(
  async (): Promise<AgentTokenResult> => {
    const cookieHeader = getRequest().headers.get("cookie");
    const token = readAuthCookie(cookieHeader);
    if (!token) return { token: null, repId: null, email: null };
    const payload = await authPayloadFromCookieHeader(cookieHeader);
    if (!payload) return { token: null, repId: null, email: null };
    return { token, repId: payload.sub, email: payload.email };
  },
);
