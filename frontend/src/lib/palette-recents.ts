export type RecentKind = "contact" | "company" | "ticket" | "deal";

export type RecentEntity = {
  kind: RecentKind;
  id: string;
  label: string;
  ts: number;
};

const KEY = "crema:palette-recents";
const MAX = 5;

export function loadRecents(): RecentEntity[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is RecentEntity =>
        r && typeof r.id === "string" && typeof r.label === "string" && typeof r.kind === "string",
    );
  } catch {
    return [];
  }
}

export function pushRecent(entity: Omit<RecentEntity, "ts">): void {
  if (typeof localStorage === "undefined") return;
  const current = loadRecents();
  const filtered = current.filter((r) => !(r.kind === entity.kind && r.id === entity.id));
  const next = [{ ...entity, ts: Date.now() }, ...filtered].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage may be full or blocked — silently swallow.
  }
}
