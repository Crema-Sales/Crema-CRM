import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { TOUR_STEPS } from "./tour-steps";

// Tour-seen state is scoped per user id: localStorage is shared by every
// account that signs in on this browser, so a global key would let one
// user's seen-state suppress the welcome prompt for the next person who
// signs up here. Value: "prompted" | "skipped" | "completed" — any
// non-empty value suppresses the welcome prompt; only truthiness is read.
const lsKeyFor = (userId: string) => `crema_tour_v1:${userId}`;

type TourContextValue = {
  isOpen: boolean;
  stepIndex: number;
  totalSteps: number;
  showWelcomePrompt: boolean;
  startTour: () => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
  finish: () => void;
  dismissWelcomePrompt: () => void;
  promptIfFirstVisit: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [showWelcomePrompt, setShowWelcomePrompt] = useState(false);
  const lsKey = lsKeyFor(userId);

  const startTour = useCallback(() => {
    setStepIndex(0);
    setIsOpen(true);
    setShowWelcomePrompt(false);
  }, []);

  const finish = useCallback(() => {
    setIsOpen(false);
    try {
      localStorage.setItem(lsKey, "completed");
    } catch {}
  }, [lsKey]);

  const skip = useCallback(() => {
    setIsOpen(false);
    setShowWelcomePrompt(false);
    try {
      localStorage.setItem(lsKey, "skipped");
    } catch {}
  }, [lsKey]);

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i >= TOUR_STEPS.length - 1) {
        finish();
        return i;
      }
      return i + 1;
    });
  }, [finish]);

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const dismissWelcomePrompt = useCallback(() => {
    setShowWelcomePrompt(false);
    try {
      localStorage.setItem(lsKey, "skipped");
    } catch {}
  }, [lsKey]);

  const promptIfFirstVisit = useCallback(() => {
    try {
      const seen = localStorage.getItem(lsKey);
      if (seen) return;
      // Persist "prompted" the instant we decide to show the prompt — before
      // the user does anything with it. The terminal actions (finish/skip/
      // dismiss) overwrite this with a more specific value, but if the user
      // abandons the tour by navigating, reloading, or closing the tab, the
      // flag is already set, so the welcome prompt never re-fires. Without
      // this, an abandoned tour leaves no record and nags on every revisit.
      localStorage.setItem(lsKey, "prompted");
      setShowWelcomePrompt(true);
    } catch {
      // localStorage unavailable (SSR / strict mode) — silently no-op
    }
  }, [lsKey]);

  // Esc closes/skips the tour while it's open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        skip();
      } else if (e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, next, prev, skip]);

  const value = useMemo<TourContextValue>(
    () => ({
      isOpen,
      stepIndex,
      totalSteps: TOUR_STEPS.length,
      showWelcomePrompt,
      startTour,
      next,
      prev,
      skip,
      finish,
      dismissWelcomePrompt,
      promptIfFirstVisit,
    }),
    [
      isOpen,
      stepIndex,
      showWelcomePrompt,
      startTour,
      next,
      prev,
      skip,
      finish,
      dismissWelcomePrompt,
      promptIfFirstVisit,
    ],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside <TourProvider>");
  return ctx;
}
