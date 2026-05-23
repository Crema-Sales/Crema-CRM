// repId format: lowercased email (RFC 5322 subset) or UUIDv4.
// Validated at JWT mint (`/dev/token`) and on every `/agents/:repId/*` route.
// The protocol doc (`shared/agent-ws-protocol.md`) is the source of truth.

const EMAIL_RE =
  /^[a-z0-9._%+\-]+@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)+$/;
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_LEN = 254;

export function isValidRepId(repId: unknown): repId is string {
  if (typeof repId !== "string") return false;
  if (repId.length === 0 || repId.length > MAX_LEN) return false;
  return EMAIL_RE.test(repId) || UUID_V4_RE.test(repId);
}

// The dev-mode fallback (`?token=dev` → repId `rep_demo`) predates strict
// format enforcement and is referenced throughout seed data. Allow it through
// only when ENVIRONMENT="dev".
export function isValidRepIdForRoute(repId: unknown, environment: string | undefined): repId is string {
  if (isValidRepId(repId)) return true;
  if (environment === "dev" && repId === "rep_demo") return true;
  return false;
}
