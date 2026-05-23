const RECENT_KEY = "crema:help:recent";
const FEEDBACK_KEY = "crema:help:feedback";
const RECENT_CAP = 5;
const FEEDBACK_CAP = 50;

export type RecentHelpEntry = {
  id: string;
  title: string;
  path: string;
  ts: number;
};

export type HelpFeedbackEntry = {
  topic: string;
  value: "up" | "down";
  ts: number;
};

function safeReadArray<T>(key: string, isValid: (v: unknown) => v is T): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValid);
  } catch {
    return [];
  }
}

function safeWrite<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode, quota); silently ignore.
  }
}

function isRecentEntry(v: unknown): v is RecentHelpEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.title === "string" &&
    typeof e.path === "string" &&
    typeof e.ts === "number"
  );
}

function isFeedbackEntry(v: unknown): v is HelpFeedbackEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.topic === "string" &&
    (e.value === "up" || e.value === "down") &&
    typeof e.ts === "number"
  );
}

export function readRecentHelp(): RecentHelpEntry[] {
  return safeReadArray(RECENT_KEY, isRecentEntry);
}

/**
 * Push a topic onto the recent list. Newest first; dedupes by `id`; caps at 5.
 * The supplied `now` lets tests use deterministic timestamps.
 */
export function pushRecentHelp(
  entry: Omit<RecentHelpEntry, "ts">,
  now: number = Date.now(),
): RecentHelpEntry[] {
  const existing = readRecentHelp();
  const filtered = existing.filter((e) => e.id !== entry.id);
  const next: RecentHelpEntry[] = [{ ...entry, ts: now }, ...filtered].slice(0, RECENT_CAP);
  safeWrite(RECENT_KEY, next);
  return next;
}

export function readHelpFeedback(): HelpFeedbackEntry[] {
  return safeReadArray(FEEDBACK_KEY, isFeedbackEntry);
}

/**
 * Append a feedback entry. Oldest entries drop off once the array exceeds 50.
 */
export function pushHelpFeedback(
  entry: Omit<HelpFeedbackEntry, "ts">,
  now: number = Date.now(),
): HelpFeedbackEntry[] {
  const existing = readHelpFeedback();
  const next: HelpFeedbackEntry[] = [...existing, { ...entry, ts: now }].slice(-FEEDBACK_CAP);
  safeWrite(FEEDBACK_KEY, next);
  return next;
}
