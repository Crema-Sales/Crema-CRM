/**
 * Emit pipeline — content script → service worker.
 *
 * The emitter dedups by `dedupeKey` within the page lifetime (SPA adapters
 * fire observers liberally) and caps free-text fields before handing the
 * event to the service worker via `chrome.runtime.sendMessage`. The SW
 * dedups again across page reloads and forwards to the RepAgent DO.
 */

import type { ActivityEvent, EmitFn } from "./types";

const SUBJECT_CAP = 200;
const PREVIEW_CAP = 280;
const SEEN_CAP = 500;

export function makeEmitter(): EmitFn {
  const seen = new Set<string>();

  return (event: ActivityEvent) => {
    if (seen.has(event.dedupeKey)) return;
    seen.add(event.dedupeKey);
    if (seen.size > SEEN_CAP) {
      const oldest = seen.values().next().value;
      if (oldest !== undefined) seen.delete(oldest);
    }

    const clean: ActivityEvent = {
      ...event,
      subject: event.subject?.slice(0, SUBJECT_CAP),
      preview: event.preview?.slice(0, PREVIEW_CAP),
    };

    try {
      chrome.runtime.sendMessage({ type: "activity_event", event: clean }, () => {
        // read lastError so Chrome doesn't log an unchecked-error warning
        void chrome.runtime.lastError;
      });
      console.log("[crema-capture] event:", clean.kind, clean.contact ?? "");
    } catch (err) {
      console.warn("[crema-capture] emit failed:", err);
    }
  };
}
