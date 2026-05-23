// Server-only cookie helpers. NEVER imported from client modules.
import { verifyJwt, type JwtPayload } from "./crypto";
import { getDB, getEnv } from "@/db/env.server";

// Dev-only fallback: when DEV_AUTO_LOGIN_EMAIL is set in .dev.vars, treat
// every unauthenticated request as that user. Lets us skip the /login screen
// locally without seeding cookies. Returns null in prod (env var unset).
async function devAutoSessionPayload(): Promise<JwtPayload | null> {
  const env = getEnv();
  const email = env.DEV_AUTO_LOGIN_EMAIL?.trim().toLowerCase();
  if (!email) return null;
  const user = await getDB()
    .prepare("SELECT id, email, role, is_super_admin FROM users WHERE email = ?")
    .bind(email)
    .first<{
      id: string;
      email: string;
      role: "admin" | "manager" | "rep";
      is_super_admin: number;
    }>();
  if (!user) return null;
  const org = await getDB()
    .prepare("SELECT org_id FROM organization_members WHERE user_id = ? LIMIT 1")
    .bind(user.id)
    .first<{ org_id: string }>();
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: user.id,
    email: user.email,
    role: user.role,
    current_org_id: org?.org_id,
    is_super_admin: user.is_super_admin === 1 ? true : undefined,
    iat: now,
    exp: now + 60 * 60 * 24 * 7,
  };
}

export const AUTH_COOKIE = "ctv_auth";

export function readAuthCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === AUTH_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export function buildAuthCookie(token: string, maxAgeSec: number): string {
  return [
    `${AUTH_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ].join("; ");
}

export function clearAuthCookie(): string {
  return `${AUTH_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function authPayloadFromCookieHeader(cookieHeader: string | null | undefined): Promise<JwtPayload | null> {
  const token = readAuthCookie(cookieHeader);
  if (token) {
    const payload = await verifyJwt(token, getEnv().JWT_SECRET);
    if (payload) return payload;
  }
  return await devAutoSessionPayload();
}
