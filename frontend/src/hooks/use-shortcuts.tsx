import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ShortcutGroup =
  | "Navigation"
  | "Action"
  | "Search"
  | "Global"
  | "List"
  | "Workspace";

export type Shortcut = {
  id: string;
  keys: string[];
  label: string;
  group: ShortcutGroup;
  when?: () => boolean;
  run: () => void | boolean;
  /** Optional metadata for renderers (e.g., the palette uses meta.url for icon lookup). */
  meta?: Record<string, unknown>;
};

type RegistryContext = {
  register: (shortcut: Shortcut) => () => void;
  getAll: () => Shortcut[];
  subscribe: (listener: () => void) => () => void;
};

const ShortcutsCtx = createContext<RegistryContext | null>(null);

const HINTS_VISIBLE_KEY = "crema:shortcut-hints-visible";

type HintsContextValue = { visible: boolean; setVisible: (v: boolean) => void };
const HintsCtx = createContext<HintsContextValue>({ visible: false, setVisible: () => {} });

export function useHintsVisible(): boolean {
  return useContext(HintsCtx).visible;
}

export function useShortcutHints(): HintsContextValue {
  return useContext(HintsCtx);
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

function normalizeKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey && !isMac) parts.push("mod");
  if (e.metaKey && isMac) parts.push("mod");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  const k = e.key.toLowerCase();
  if (!["control", "meta", "alt", "shift"].includes(k)) parts.push(k);
  return parts.join("+");
}

function tokenize(combo: string): string[] {
  return combo.toLowerCase().split(" ").filter(Boolean);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (target.closest("[cmdk-input-wrapper]") || target.closest("[data-cmdk-input]")) return true;
  return false;
}

export function formatKeys(combo: string): string[] {
  const tokens = tokenize(combo);
  // chord with space: each token is a single key tap (e.g., "g f")
  if (tokens.length > 1 && !tokens[0].includes("+") && !tokens[1].includes("+")) {
    return tokens.map((t) => t.toUpperCase());
  }
  // modifier combo like "mod+k" or "shift+?"
  return combo.split("+").map((p) => {
    const k = p.trim().toLowerCase();
    if (k === "mod") return isMac ? "⌘" : "Ctrl";
    if (k === "shift") return "⇧";
    if (k === "alt") return isMac ? "⌥" : "Alt";
    if (k === "ctrl") return "Ctrl";
    if (k === "enter") return "↵";
    if (k === "escape" || k === "esc") return "Esc";
    if (k === "arrowup") return "↑";
    if (k === "arrowdown") return "↓";
    if (k === "arrowleft") return "←";
    if (k === "arrowright") return "→";
    if (k === " " || k === "space") return "Space";
    return k.length === 1 ? k.toUpperCase() : k;
  });
}

export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const registry = useRef<Map<string, Shortcut>>(new Map());
  const listeners = useRef<Set<() => void>>(new Set());
  const chordBuffer = useRef<{ keys: string[]; timer: number | null }>({ keys: [], timer: null });
  const [chordPending, setChordPending] = useState<string | null>(null);
  const [hintsVisible, setHintsVisibleState] = useState<boolean>(() => {
    if (typeof localStorage === "undefined") return false;
    try {
      return localStorage.getItem(HINTS_VISIBLE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const setHintsVisible = useCallback((v: boolean) => {
    setHintsVisibleState(v);
    try {
      localStorage.setItem(HINTS_VISIBLE_KEY, v ? "1" : "0");
    } catch {
      // ignore
    }
  }, []);
  const hintsCtxValue = useMemo<HintsContextValue>(
    () => ({ visible: hintsVisible, setVisible: setHintsVisible }),
    [hintsVisible, setHintsVisible],
  );

  const notify = useCallback(() => {
    for (const l of listeners.current) l();
  }, []);

  const register = useCallback(
    (shortcut: Shortcut) => {
      registry.current.set(shortcut.id, shortcut);
      notify();
      return () => {
        registry.current.delete(shortcut.id);
        notify();
      };
    },
    [notify],
  );

  const ctxValue = useMemo<RegistryContext>(
    () => ({
      register,
      getAll: () => Array.from(registry.current.values()),
      subscribe: (l: () => void) => {
        listeners.current.add(l);
        return () => {
          listeners.current.delete(l);
        };
      },
    }),
    [register],
  );

  useEffect(() => {
    function clearChord() {
      const t = chordBuffer.current.timer;
      if (t !== null) window.clearTimeout(t);
      chordBuffer.current = { keys: [], timer: null };
      setChordPending(null);
    }

    function matches(shortcut: Shortcut, currentKey: string, buffered: string[]): boolean {
      for (const combo of shortcut.keys) {
        const tokens = tokenize(combo);
        const hasModifier = tokens.some((t) => t.includes("+"));
        if (hasModifier || tokens.length === 1) {
          if (combo.toLowerCase() === currentKey) return true;
        } else {
          // chord sequence
          const seq = [...buffered, currentKey];
          if (seq.length === tokens.length && tokens.every((t, i) => t === seq[i])) return true;
        }
      }
      return false;
    }

    function partialChordMatch(currentKey: string, buffered: string[]): boolean {
      const seq = [...buffered, currentKey];
      for (const s of registry.current.values()) {
        for (const combo of s.keys) {
          const tokens = tokenize(combo);
          if (tokens.length <= 1 || tokens.some((t) => t.includes("+"))) continue;
          if (tokens.length > seq.length && seq.every((k, i) => k === tokens[i])) return true;
        }
      }
      return false;
    }

    function onKeyDown(e: KeyboardEvent) {
      // Always allow Escape to clear pending chord
      if (e.key === "Escape" && chordBuffer.current.keys.length > 0) {
        clearChord();
        return;
      }

      const isInput = isTypingTarget(e.target);
      const normalized = normalizeKey(e);
      const hasModifier = normalized.includes("mod") || normalized.includes("alt");

      // While typing in inputs, only modifier combos (Cmd+K) survive
      if (isInput && !hasModifier) return;

      // First check exact matches against current key + buffered chord
      for (const s of registry.current.values()) {
        if (s.when && !s.when()) continue;
        if (matches(s, normalized, chordBuffer.current.keys)) {
          e.preventDefault();
          clearChord();
          s.run();
          return;
        }
      }

      // If this could start/continue a chord, buffer it
      if (!hasModifier && partialChordMatch(normalized, chordBuffer.current.keys)) {
        e.preventDefault();
        chordBuffer.current.keys.push(normalized);
        setChordPending(chordBuffer.current.keys.join(" ").toUpperCase());
        const t = chordBuffer.current.timer;
        if (t !== null) window.clearTimeout(t);
        chordBuffer.current.timer = window.setTimeout(() => {
          clearChord();
        }, 1200);
        return;
      }

      // No match and no chord continuation — clear any stale buffer
      if (chordBuffer.current.keys.length > 0) clearChord();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <ShortcutsCtx.Provider value={ctxValue}>
      <HintsCtx.Provider value={hintsCtxValue}>{children}</HintsCtx.Provider>
      {chordPending && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] rounded-md border border-border bg-popover px-3 py-1.5 text-xs font-mono text-popover-foreground shadow-lg"
          aria-live="polite"
        >
          {chordPending}…
        </div>
      )}
    </ShortcutsCtx.Provider>
  );
}

export function useRegisterShortcut(shortcut: Shortcut | Shortcut[] | undefined | null) {
  const ctx = useContext(ShortcutsCtx);
  useEffect(() => {
    if (!ctx || !shortcut) return;
    const list = Array.isArray(shortcut) ? shortcut.filter(Boolean) : [shortcut];
    const unregisters = list.map((s) => ctx.register(s));
    return () => {
      for (const u of unregisters) u();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ctx,
    JSON.stringify(
      (Array.isArray(shortcut) ? shortcut : [shortcut]).filter(Boolean).map((s) => s?.id),
    ),
  ]);
}

export function useShortcuts(): Shortcut[] {
  const ctx = useContext(ShortcutsCtx);
  const [, force] = useState(0);
  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe(() => force((n: number) => n + 1));
  }, [ctx]);
  return ctx ? ctx.getAll() : [];
}
