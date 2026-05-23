// Server-fns for the optional per-user coach persona pick.
//
// The persona catalog lives in src/lib/coach-personas.ts and the backend
// agent mirrors `voiceNotes` in backend/src/coach-personas.ts. This file
// only manages which slug the rep selected (or null = no coach).

import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { authPayloadFromCookieHeader, buildAuthCookie } from "./cookies.server";
import { signJwt } from "./crypto";
import { getDB, getEnv } from "@/db/env.server";
import { COACH_PERSONAS_BY_SLUG } from "@/lib/coach-personas";
import { getOrganization } from "@/lib/orgs.server";

const SESSION_TTL_SEC = 60 * 60 * 24 * 7;

async function requireSession() {
  const req = getRequest();
  const payload = await authPayloadFromCookieHeader(req?.headers?.get("cookie"));
  if (!payload) {
    setResponseStatus(401);
    throw new Error("Unauthorized");
  }
  return payload;
}

export const getMyCoachPersona = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  const row = await getDB()
    .prepare("SELECT coach_persona_slug FROM users WHERE id = ?")
    .bind(session.sub)
    .first<{ coach_persona_slug: string | null }>();
  return { slug: row?.coach_persona_slug ?? null };
});

export const setMyCoachPersona = createServerFn({ method: "POST" })
  .inputValidator((d: { slug: string | null }) =>
    z.object({ slug: z.string().min(1).max(64).nullable() }).parse(d),
  )
  .handler(async ({ data }) => {
    const session = await requireSession();
    if (data.slug !== null && !COACH_PERSONAS_BY_SLUG[data.slug]) {
      throw new Error(`Unknown coach persona: ${data.slug}`);
    }
    await getDB()
      .prepare("UPDATE users SET coach_persona_slug = ? WHERE id = ?")
      .bind(data.slug, session.sub)
      .run();
    // Rebake the cookie so the next WS connection to the agent worker
    // carries the new slug — the agent reads coach_persona_slug from the
    // JWT to compose its persona-aware system prompt.
    const env = getEnv();
    const orgSystemPrompt = session.current_org_id
      ? (await getOrganization(session.current_org_id))?.system_prompt ?? null
      : null;
    const token = await signJwt(
      {
        sub: session.sub,
        email: session.email,
        role: session.role,
        current_org_id: session.current_org_id,
        coach_persona_slug: data.slug,
        org_system_prompt: orgSystemPrompt,
        user_system_prompt: session.user_system_prompt ?? null,
      },
      env.JWT_SECRET,
      SESSION_TTL_SEC,
    );
    setResponseHeader("set-cookie", buildAuthCookie(token, SESSION_TTL_SEC));
    return { ok: true, slug: data.slug };
  });
