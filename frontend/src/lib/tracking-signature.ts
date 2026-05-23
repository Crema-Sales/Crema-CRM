// Sign / verify `?crema_eid` tokens for the tracking snippet auto-identify
// path. Token format is `<emailB64url>.<sigHex>` where:
//   emailB64url = base64url(email)
//   sigHex      = first 16 bytes of HMAC-SHA256(emailB64url, tracking_secret)
//                 as hex (32 chars)
//
// 16 bytes of HMAC is plenty against forgery for this use case and keeps the
// URL short. Email lives inside the token (not a separate query param) so a
// single string is enough on the customer's side: paste, sign, send.

function b64urlEncode(s: string): string {
  // Workers/runtimes give us btoa for the ASCII path; for UTF-8 emails we
  // first encode to bytes. (Unicode in the local part is rare but valid.)
  const bytes = new TextEncoder().encode(s);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string | null {
  try {
    const padded = s.replace(/-/g, "+").replace(/_/g, "/") +
      "===".slice((s.length + 3) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
  let hex = "";
  for (let i = 0; i < sig.length; i++) hex += sig[i].toString(16).padStart(2, "0");
  return hex;
}

function timingSafeEqHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signCremaEid(email: string, trackingSecret: string): Promise<string> {
  const normalized = email.toLowerCase().trim();
  const encoded = b64urlEncode(normalized);
  const fullSig = await hmacSha256Hex(trackingSecret, encoded);
  return `${encoded}.${fullSig.slice(0, 32)}`;
}

export async function verifyCremaEid(
  token: string,
  trackingSecret: string,
): Promise<{ email: string } | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 1 || dot === token.length - 1) return null;
  const encoded = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  if (providedSig.length !== 32) return null;
  const fullSig = await hmacSha256Hex(trackingSecret, encoded);
  if (!timingSafeEqHex(providedSig, fullSig.slice(0, 32))) return null;
  const email = b64urlDecode(encoded);
  if (!email || !email.includes("@")) return null;
  return { email: email.toLowerCase() };
}
