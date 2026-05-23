/**
 * Validators for trusted-origin handoff payloads.
 * Spec: shared/agent-ws-protocol.md
 *
 * - `repId`: see protocol § "rep identity". Accepts either a lowercased
 *   email or a UUIDv4. Backend issues both formats today (UUIDv4 for new
 *   reps, email for legacy seed accounts) — narrow once backend picks one.
 *
 * - `baseUrl`: exact-match allowlist for the production Worker, plus the
 *   canonical custom-domain pattern (`*.cremasales.com`) for any future
 *   subdomain (e.g. `wss://agent.cremasales.com`). The handoff message
 *   comes from a trusted origin in `externally_connectable.matches`, but a
 *   website XSS would otherwise be able to redirect the WS dial to an
 *   attacker host. Local dev uses `ws://localhost` / `ws://127.0.0.1`.
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// RFC-5322-ish, restricted to lowercase. We don't accept uppercase letters —
// backend stores repId lowercased so we should never see mixed case here.
const LOWERCASE_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export function isValidRepId(repId: string): boolean {
  if (repId.length < 3 || repId.length > 254) return false;
  return UUID_V4.test(repId) || LOWERCASE_EMAIL.test(repId);
}

/**
 * Production Worker URL(s) the extension is allowed to dial. Exact match on
 * the normalized origin (`wss://host` with no path/query/port mismatch). Add
 * an entry here if you move the Worker to a different `workers.dev` zone.
 */
const ALLOWED_BASE_URLS: ReadonlySet<string> = new Set([
  "wss://ctrl-alt-elite-agent.smashlabs.workers.dev",
]);

function isAllowedOrigin(protocol: string, hostname: string, origin: string): boolean {
  if (protocol === "wss:") {
    // Exact allowlist for the deployed production Worker.
    if (ALLOWED_BASE_URLS.has(origin)) return true;
    // Canonical custom domain — apex and any subdomain.
    if (hostname === "cremasales.com") return true;
    if (hostname.endsWith(".cremasales.com")) return true;
    return false;
  }
  if (protocol === "ws:") {
    // Local dev only.
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    return false;
  }
  return false;
}

export function normalizeBaseUrl(input: string): string | null {
  if (typeof input !== "string" || !input) return null;
  let s = input.trim();
  // Mirror the rewrite in ws-client.ts so the allowlist key matches the dial.
  s = s.replace(/^http(s?):/i, (_, x) => `ws${x}:`);
  // Strip trailing slashes.
  s = s.replace(/\/+$/, "");
  // Reject anything that has a path / query / fragment — baseUrl is origin-only.
  try {
    const u = new URL(s);
    if (u.pathname !== "/" && u.pathname !== "") return null;
    if (u.search || u.hash) return null;
    if (u.username || u.password) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export function isAllowedBaseUrl(input: string): boolean {
  const norm = normalizeBaseUrl(input);
  if (norm === null) return false;
  try {
    const u = new URL(norm);
    return isAllowedOrigin(u.protocol, u.hostname, norm);
  } catch {
    return false;
  }
}
