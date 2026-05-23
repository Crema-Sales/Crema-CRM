import * as React from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { pushRecentHelp } from "@/components/help/help-storage";

export type HelpAnchor = { id: string; label: string };

export type HelpContent = {
  id: string;
  title: string;
  eyebrow?: string;
  anchors?: HelpAnchor[];
  component: React.ComponentType<{ activeAnchor?: string }>;
};

export type HelpDrawerState = {
  open: boolean;
  expanded: boolean;
  pinned: boolean;
  activeAnchor?: string;
};

type HelpContextValue = {
  content: HelpContent | null;
  state: HelpDrawerState;
  registerHelp: (content: HelpContent) => () => void;
  setOpen: (open: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  setPinned: (pinned: boolean) => void;
  setActiveAnchor: (id: string | undefined) => void;
  openTo: (anchorId?: string) => void;
};

const HelpContext = React.createContext<HelpContextValue | null>(null);

const EXPANDED_STORAGE_KEY = "crema:help:expanded";
const PINNED_STORAGE_KEY = "crema:help:pinned";

/**
 * Build a deep-link URL for a help topic + optional anchor. Pure helper so the
 * assistant chat / external doc surfaces can construct links without needing a
 * React/router context — pathname is supplied by the caller (typically from
 * `useRouterState({ select: r => r.location.pathname })`).
 */
export function getDeepLink(pathname: string, topic: string, anchor?: string): string {
  const params = new URLSearchParams();
  params.set("help", topic);
  if (anchor) params.set("anchor", anchor);
  return `${pathname}?${params.toString()}`;
}

function readPersistedExpanded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(EXPANDED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writePersistedExpanded(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXPANDED_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Storage may be unavailable (private mode, quota); silently ignore.
  }
}

function readPersistedPinned(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PINNED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writePersistedPinned(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PINNED_STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Storage may be unavailable (private mode, quota); silently ignore.
  }
}

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  // cmdk renders the input with a `cmdk-input` attribute today; future-proof
  // against a `data-cmdk-input` rename by matching both.
  if (el.closest("[cmdk-input], [data-cmdk-input]")) return true;
  return false;
}

function readSearchParam(search: unknown, key: "help" | "anchor"): string | undefined {
  if (!search || typeof search !== "object") return undefined;
  const value = (search as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = React.useState<HelpContent | null>(null);
  const [open, setOpenState] = React.useState(false);
  const [expanded, setExpandedState] = React.useState(false);
  const [pinned, setPinnedState] = React.useState(false);
  const [activeAnchor, setActiveAnchorState] = React.useState<string | undefined>(undefined);

  const search = useRouterState({ select: (r) => r.location.search });
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();

  // Refs so callbacks created once can read the current URL state without
  // closing over stale values.
  const searchRef = React.useRef(search);
  searchRef.current = search;
  const pathnameRef = React.useRef(pathname);
  pathnameRef.current = pathname;
  const openRef = React.useRef(open);
  openRef.current = open;
  const pinnedRef = React.useRef(pinned);
  pinnedRef.current = pinned;
  const contentRef = React.useRef(content);
  contentRef.current = content;

  // Hydrate `expanded` + `pinned` after mount so SSR markup stays deterministic.
  React.useEffect(() => {
    if (readPersistedExpanded()) setExpandedState(true);
    if (readPersistedPinned()) {
      setPinnedState(true);
      // Pinned implies the panel is visible; mirror into `open` so deep-link
      // checks and recent-help bookkeeping see a consistent state.
      setOpenState(true);
    }
  }, []);

  const stripHelpParams = React.useCallback(() => {
    const s = searchRef.current;
    if (!readSearchParam(s, "help") && !readSearchParam(s, "anchor")) return;
    // `to: "."` keeps the current route; the search updater drops both keys.
    navigate({
      to: ".",
      search: (prev: Record<string, unknown> | undefined) => {
        const next = { ...(prev ?? {}) };
        delete next.help;
        delete next.anchor;
        return next;
      },
      replace: true,
    });
  }, [navigate]);

  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenState((prev) => {
        // Push to the "recently viewed" list only on the closed → open
        // transition, and only when we actually have content to remember.
        // Skipping this on prev=true means double-toggling doesn't bump the
        // timestamp; skipping when content is null avoids polluting the list
        // with the welcome screen.
        if (next && !prev && contentRef.current) {
          pushRecentHelp({
            id: contentRef.current.id,
            title: contentRef.current.title,
            path: pathnameRef.current,
          });
        }
        return next;
      });
      if (!next) stripHelpParams();
    },
    [stripHelpParams],
  );

  // Deep-link sync: when ?help matches the registered topic, open the drawer
  // to the requested anchor. Silent no-op on mismatch so a stale link from
  // another route doesn't yank the user around. Routed through `setOpen` so
  // deep-link openings are tracked in the recent-viewed list too.
  React.useEffect(() => {
    if (!content) return;
    const helpParam = readSearchParam(search, "help");
    if (!helpParam || helpParam !== content.id) return;
    const anchorParam = readSearchParam(search, "anchor");
    if (anchorParam) setActiveAnchorState(anchorParam);
    setOpen(true);
  }, [content, search, setOpen]);

  // Global `?` shortcut. Toggles the drawer open/closed unless the user is
  // typing in an editable surface. Radix focus-traps inside open dialogs/sheets
  // prevent the `window` listener from firing while a modal is focused, so we
  // don't special-case those here. When the panel is pinned, the dock is
  // always visible — pressing `?` is a no-op rather than closing the dock,
  // since unpinning is a deliberate gesture (the pin/X button in the header).
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "?") return;
      if (isEditableTarget(document.activeElement)) return;
      e.preventDefault();
      if (pinnedRef.current) return;
      setOpen(!openRef.current);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setOpen]);

  const setExpanded = React.useCallback((next: boolean) => {
    setExpandedState(next);
    writePersistedExpanded(next);
  }, []);

  const setPinned = React.useCallback((next: boolean) => {
    setPinnedState(next);
    writePersistedPinned(next);
    // Both transitions keep `open=true`. Pinning shows the dock; unpinning
    // hands off to the modal Sheet so the panel slides back in as a drawer
    // (the user can dismiss it normally from there).
    setOpenState(true);
  }, []);

  const setActiveAnchor = React.useCallback((id: string | undefined) => {
    setActiveAnchorState(id);
  }, []);

  const openTo = React.useCallback((anchorId?: string) => {
    setActiveAnchorState(anchorId);
    setOpenState(true);
  }, []);

  const registerHelp = React.useCallback((next: HelpContent) => {
    setContent(next);
    return () => {
      // Only clear if our content is still the active one — guards against the
      // unmount-after-remount race during route transitions where another
      // route may have already taken over the slot.
      setContent((current) => (current && current.id === next.id ? null : current));
    };
  }, []);

  const state = React.useMemo<HelpDrawerState>(
    () => ({ open, expanded, pinned, activeAnchor }),
    [open, expanded, pinned, activeAnchor],
  );

  const value = React.useMemo<HelpContextValue>(
    () => ({
      content,
      state,
      registerHelp,
      setOpen,
      setExpanded,
      setPinned,
      setActiveAnchor,
      openTo,
    }),
    [content, state, registerHelp, setOpen, setExpanded, setPinned, setActiveAnchor, openTo],
  );

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelp() {
  const ctx = React.useContext(HelpContext);
  if (!ctx) {
    throw new Error("useHelp must be used within a HelpProvider.");
  }
  return ctx;
}

export function useRegisterHelp(content: HelpContent | undefined, deps: React.DependencyList = []) {
  const ctx = React.useContext(HelpContext);
  if (!ctx) {
    throw new Error("useRegisterHelp must be used within a HelpProvider.");
  }
  const { registerHelp } = ctx;

  // Hold the latest content in a ref so we re-register with current data when
  // deps change, without forcing callers to memoize the content object.
  const contentRef = React.useRef(content);
  contentRef.current = content;

  React.useEffect(() => {
    const current = contentRef.current;
    if (!current) return;
    return registerHelp(current);
    // Deps are caller-controlled; the registry intentionally re-runs only when
    // the caller asks for it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
