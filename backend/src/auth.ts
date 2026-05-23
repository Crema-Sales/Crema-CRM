import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { SignJWT, jwtVerify } from "jose";
import { errorBody } from "./routes/_util";
import type { Env } from "./index";

export type RepIdentity = {
  repId: string;
  email: string;
  coachPersonaSlug: string | null;
};

function signingKey(env: Env): Uint8Array {
  return new TextEncoder().encode(env.JWT_SIGNING_KEY);
}

export async function signRepJwt(env: Env, repId: string, email: string): Promise<string> {
  return new SignJWT({ sub: repId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(signingKey(env));
}

export async function verifyRepJwt(env: Env, token: string): Promise<RepIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(env), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    const rawSlug = (payload as Record<string, unknown>).coach_persona_slug;
    const coachPersonaSlug = typeof rawSlug === "string" && rawSlug.length > 0 ? rawSlug : null;
    return { repId: payload.sub, email: payload.email, coachPersonaSlug };
  } catch {
    return null;
  }
}

/**
 * Decode `coach_persona_slug` from a JWT without re-verifying the signature.
 * The agent already received this token over an authenticated WS upgrade
 * and persisted it; this helper just plucks the claim for prompt composition.
 */
export function readCoachSlugFromJwt(token: string): string | null {
  return readClaim(token, "coach_persona_slug");
}

/**
 * Free-form org/user system-prompt overlays the frontend signs into the JWT.
 * The agent layers them under the Crema lead-in (see `buildSystemPrompt`).
 * Same "decode without verify" tradeoff as `readCoachSlugFromJwt` — the WS
 * upgrade already authenticated the token.
 */
export function readSystemPromptsFromJwt(token: string): {
  orgPrompt: string | null;
  userPrompt: string | null;
} {
  return {
    orgPrompt: readClaim(token, "org_system_prompt"),
    userPrompt: readClaim(token, "user_system_prompt"),
  };
}

/**
 * Decode the `sub` claim (the repId) from a JWT without re-verifying the
 * signature. Same "the WS upgrade already authenticated this token" tradeoff
 * as `readCoachSlugFromJwt` — used by the agent's browser-control tools to
 * address `/agents/:repId/act` for the rep that owns this turn.
 */
export function readRepIdFromJwt(token: string): string | null {
  return readClaim(token, "sub");
}

function readClaim(token: string, key: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as Record<string, unknown>;
    const value = payload[key];
    return typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function unauthorized(): HTTPException {
  return new HTTPException(401, {
    res: Response.json(errorBody("unauthorized", "missing or invalid JWT"), { status: 401 }),
  });
}

function extractBearer(c: Context): string | null {
  const authz = c.req.header("Authorization");
  if (!authz) return null;
  const m = authz.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export async function requireRep<E extends { Bindings: Env }>(
  c: Context<E>,
): Promise<RepIdentity> {
  const token = extractBearer(c);
  if (!token) throw unauthorized();
  if (c.env.ENVIRONMENT === "dev" && token === "dev") {
    return { repId: "rep_demo", email: "demo@cremasales.example", coachPersonaSlug: null };
  }
  const rep = await verifyRepJwt(c.env, token);
  if (!rep) throw unauthorized();
  return rep;
}
