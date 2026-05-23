import { AnimatePresence, motion } from "framer-motion";
import { Coffee } from "lucide-react";
import { useTour } from "./tour-context";

export function TourWelcomePrompt() {
  const { showWelcomePrompt, startTour, dismissWelcomePrompt, isOpen } = useTour();

  // Suppress the prompt while the tour itself is on screen.
  if (!showWelcomePrompt || isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="tour-welcome"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[90] bg-foreground/40 backdrop-blur-sm flex items-center justify-center px-4"
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 8 }}
          transition={{ type: "spring", stiffness: 280, damping: 28 }}
          className="w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground shadow-2xl p-7"
        >
          <div
            className="mx-auto mb-5 size-14 rounded-xl flex items-center justify-center"
            style={{ backgroundImage: "linear-gradient(135deg, #3b2418, #c9885a)" }}
          >
            <Coffee className="size-7 text-white" />
          </div>
          <h2
            className="text-center text-2xl font-semibold tracking-tight mb-2"
            style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
          >
            Welcome to Crema.
          </h2>
          <p className="text-center text-sm text-muted-foreground mb-6">
            First time here? Take a 60-second tour and we'll show you where things live. You
            can restart it anytime from Settings.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={dismissWelcomePrompt}
              className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={startTour}
              autoFocus
              className="px-5 py-2 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors"
            >
              Let's take a tour
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
