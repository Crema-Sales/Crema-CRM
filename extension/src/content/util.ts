/**
 * Shared DOM helpers for the content-script adapters.
 *
 * The comms-surface adapters target obfuscated third-party SPAs, so every
 * selector below is best-effort with a fallback ladder. Helpers here never
 * throw — a missed selector yields `null`/`""` and the adapter emits nothing.
 */

/** Collapsed, trimmed text content of an element. */
export function txt(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** First element matching any selector in the fallback ladder. */
export function pick(root: ParentNode, ...selectors: string[]): Element | null {
  for (const s of selectors) {
    try {
      const el = root.querySelector(s);
      if (el) return el;
    } catch {
      // invalid selector on this engine — skip
    }
  }
  return null;
}

/** Nearest ancestor of `el` matching any selector in the ladder. */
export function closestMatch(el: Element, selectors: string[]): Element | null {
  for (const s of selectors) {
    try {
      const found = el.closest(s);
      if (found) return found;
    } catch {
      // skip
    }
  }
  return null;
}

/** Capture-phase delegated click listener. Returns a teardown function. */
export function onDocumentClick(handler: (target: Element) => void): () => void {
  const listener = (ev: Event) => {
    if (ev.target instanceof Element) {
      try {
        handler(ev.target);
      } catch (err) {
        console.warn("[crema-capture] click handler threw:", err);
      }
    }
  };
  document.addEventListener("click", listener, true);
  return () => document.removeEventListener("click", listener, true);
}

/** Trailing-edge debounce. */
export function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

/** Cheap, stable, non-cryptographic string hash (djb2 → base36). */
export function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Pull an email address out of arbitrary text, if one is present. */
export function extractEmail(s: string): string | undefined {
  const m = s.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0].toLowerCase() : undefined;
}
