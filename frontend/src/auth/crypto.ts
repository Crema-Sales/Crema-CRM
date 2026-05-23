// Password hashing + JWT signing using Web Crypto (no deps, Workers-compatible).

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH = "SHA-256";
const PBKDF2_KEY_LEN = 32;
const SALT_LEN = 16;

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function base64UrlEncode(input: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof input === "string" ? enc.encode(input) : new Uint8Array(input as ArrayBuffer);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (input.length % 4)) % 4);
  const str = atob(padded);
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i);
  return out;
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const hashBytes = await pbkdf2(password, saltBytes);
  return { hash: bytesToHex(hashBytes), salt: bytesToHex(saltBytes) };
}

export async function verifyPassword(password: string, hashHex: string, saltHex: string): Promise<boolean> {
  const expected = hexToBytes(hashHex);
  const actual = await pbkdf2(password, hexToBytes(saltHex));
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    baseKey,
    PBKDF2_KEY_LEN * 8,
  );
  return new Uint8Array(bits);
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: "admin" | "manager" | "rep";
  current_org_id?: string;
  coach_persona_slug?: string | null;
  // Free-form system-prompt overlays composed by the backend agent on every
  // chat turn (Crema lead-in → org → coach → user). Both nullable; the agent
  // skips a block when its claim is null/empty.
  org_system_prompt?: string | null;
  user_system_prompt?: string | null;
  // Cross-org god-mode flag. Stale-after-revoke for ≤7 days (the JWT TTL) —
  // super-admin-gated reads should also do a fresh DB check when the
  // consequences of a stale `true` are non-trivial.
  is_super_admin?: boolean;
  iat: number;
  exp: number;
}

export async function signJwt(payload: Omit<JwtPayload, "iat" | "exp">, secret: string, ttlSec = 60 * 60 * 24 * 7): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const full: JwtPayload = { ...payload, iat: now, exp: now + ttlSec };
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(full));
  const data = `${header}.${body}`;
  const sig = await hmacSign(data, secret);
  return `${data}.${sig}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, bodyB64, sigB64] = parts;
  const data = `${headerB64}.${bodyB64}`;
  const expected = await hmacSign(data, secret);
  if (expected !== sigB64) return null;
  let payload: JwtPayload;
  try {
    payload = JSON.parse(dec.decode(base64UrlDecode(bodyB64)));
  } catch {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return base64UrlEncode(sig);
}
