// HMAC-SHA256 webhook signing — Stripe-shape: sha256(secret, "<ts>.<rawBody>").
// Pure crypto.subtle (Workers ships it). No deps, no Node crypto import.
// See Webhooks/DESIGN.md → Wire format — generic JSON.

const enc = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

/**
 * Sign a webhook body. Returns `"sha256=" + lowercase-hex(HMAC-SHA256(secret, `${timestamp}.${rawBody}`))`.
 * Pass the EXACT bytes you will POST — re-stringifying on the receiver side breaks verification.
 */
export async function signBody(
  secret: string,
  timestamp: number,
  rawBody: string,
): Promise<string> {
  const hex = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return `sha256=${hex}`;
}

/**
 * Generate a fresh 32-byte secret, hex-encoded (64 lowercase chars).
 * Used on subscription create and "Regenerate secret".
 */
export function generateSecret(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * Non-reversible 8-char fingerprint of a secret (first 8 hex chars of sha256(secret)).
 * The list UI shows this instead of the raw secret.
 */
export async function secretFingerprint(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return bytesToHex(new Uint8Array(digest)).slice(0, 8);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a signature header against a recomputed HMAC. For our own smoke tests
 * (Phase 05) — recipients can copy this pattern. Constant-time compare avoids
 * early-exit timing leaks on per-character mismatch.
 */
export async function verifyBody(
  secret: string,
  timestamp: number,
  rawBody: string,
  sigHeader: string,
): Promise<boolean> {
  const expected = await signBody(secret, timestamp, rawBody);
  return constantTimeEqual(expected, sigHeader);
}
