// Browser-local onboarding gates.
//
// Unlike server-side state (org membership, the saved coach persona), these
// decide whether *this browser* has already walked a user through the
// new-user onboarding. That's deliberate: signing in as the same account on a
// fresh browser should replay the coach picker + interface tour, so the flag
// lives in localStorage, not the DB.
//
// Scoped per user id because localStorage is shared by every account that
// signs in on this machine — a global key would let one user's "done" state
// suppress onboarding for the next person who signs in here.
//
// The interface tour keeps its own equivalent flag inside tour-context.tsx
// (key `crema_tour_v1:<userId>`); this module covers the coach-picker step
// and the conversational intro that follows it.

const coachKeyFor = (userId: string) => `crema_coach_onboarded_v1:${userId}`;
const introKeyFor = (userId: string) => `crema_intro_convo_v1:${userId}`;
const tourKeyFor = (userId: string) => `crema_tour_v1:${userId}`;

/**
 * True once this browser has completed (picked or skipped) the coach picker
 * for the given user. When localStorage is unavailable (SSR / strict mode /
 * blocked cookies) we report `true` so we never trap the user in an
 * onboarding redirect they can't get past.
 */
export function hasSeenCoachOnboarding(userId: string): boolean {
  try {
    return localStorage.getItem(coachKeyFor(userId)) === "done";
  } catch {
    return true;
  }
}

/** Marks the coach picker as completed for this user on this browser. */
export function markCoachOnboardingSeen(userId: string): void {
  try {
    localStorage.setItem(coachKeyFor(userId), "done");
  } catch {
    // localStorage unavailable — silently no-op.
  }
}

/**
 * True once this browser has walked the user through the conversational
 * intro (coach greeting → tour offer). Same per-browser, per-user scoping
 * as the coach picker: a fresh browser replays it. Reports `true` when
 * localStorage is unavailable so we never trap the user in the overlay.
 */
export function hasSeenIntroConversation(userId: string): boolean {
  try {
    return localStorage.getItem(introKeyFor(userId)) === "done";
  } catch {
    return true;
  }
}

/** Marks the conversational intro as completed for this user on this browser. */
export function markIntroConversationSeen(userId: string): void {
  try {
    localStorage.setItem(introKeyFor(userId), "done");
  } catch {
    // localStorage unavailable — silently no-op.
  }
}

/**
 * Clears every browser-local onboarding flag for this user — coach picker,
 * intro conversation, and the interface tour — so the next visit replays the
 * full new-user flow. Used by the "Restart onboarding" entry points in
 * Settings and the command palette. Caller is expected to reload / navigate
 * to `/onboarding/coach` after this so the component refs that gate each
 * step are remounted with a fresh state.
 */
export function resetAllOnboarding(userId: string): void {
  try {
    localStorage.removeItem(coachKeyFor(userId));
    localStorage.removeItem(introKeyFor(userId));
    localStorage.removeItem(tourKeyFor(userId));
  } catch {
    // localStorage unavailable — silently no-op.
  }
}
