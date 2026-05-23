import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Coffee, X } from "lucide-react";
import { TOUR_STEPS, type TourStep } from "./tour-steps";
import { useTour } from "./tour-context";

type Rect = { top: number; left: number; width: number; height: number };

const POPOVER_W = 360;
const POPOVER_OFFSET = 16; // gap between target and popover
const PAD_DEFAULT = 10;
const VIEWPORT_MARGIN = 16;

/**
 * Tracks an element's bounding rect over time. Returns null until the
 * element is mounted in the DOM and has non-zero size.
 *
 * Watches: scroll, resize, ResizeObserver on the target, MutationObserver on
 * body (catches sidebar collapse, sheet open, etc.).
 */
function useTargetRect(selector: string | undefined, isOpen: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || !selector) {
      setRect(null);
      return;
    }

    let rafId = 0;
    let target: Element | null = null;
    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;

    const measure = () => {
      const el = document.querySelector(selector);
      target = el;
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        setRect(null);
        return;
      }
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    measure();

    // Re-query the target each tick — the element might mount late or swap
    // (e.g., navigation changes which sidebar item is rendered).
    const interval = window.setInterval(() => {
      const el = document.querySelector(selector);
      if (el !== target) {
        target = el;
        if (ro) ro.disconnect();
        if (el && "ResizeObserver" in window) {
          ro = new ResizeObserver(schedule);
          ro.observe(el);
        }
      }
      schedule();
    }, 250);

    if ("ResizeObserver" in window && target) {
      ro = new ResizeObserver(schedule);
      ro.observe(target);
    }
    mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });

    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearInterval(interval);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [selector, isOpen]);

  return rect;
}

function computePopoverPosition(
  rect: Rect,
  placement: TourStep["placement"],
  vw: number,
  vh: number,
  popoverHeightEstimate: number,
): { top: number; left: number; placement: "right" | "left" | "top" | "bottom" } {
  const prefer = placement ?? "right";

  const tries: Array<"right" | "left" | "bottom" | "top"> = [
    prefer,
    prefer === "right" ? "left" : "right",
    prefer === "bottom" ? "top" : "bottom",
    prefer === "top" ? "bottom" : "top",
  ];

  const clampV = (v: number) =>
    Math.max(VIEWPORT_MARGIN, Math.min(vh - popoverHeightEstimate - VIEWPORT_MARGIN, v));
  const clampH = (v: number) =>
    Math.max(VIEWPORT_MARGIN, Math.min(vw - POPOVER_W - VIEWPORT_MARGIN, v));

  // For right/left: only the horizontal axis must "fit"; vertical is clamped
  // to viewport so a target near the top/bottom edge still gets the preferred
  // side instead of being shoved to bottom-stacked fallback.
  for (const p of tries) {
    if (p === "right") {
      const left = rect.left + rect.width + POPOVER_OFFSET;
      if (left + POPOVER_W <= vw - VIEWPORT_MARGIN) {
        return { top: clampV(rect.top + rect.height / 2 - popoverHeightEstimate / 2), left, placement: p };
      }
    } else if (p === "left") {
      const left = rect.left - POPOVER_W - POPOVER_OFFSET;
      if (left >= VIEWPORT_MARGIN) {
        return { top: clampV(rect.top + rect.height / 2 - popoverHeightEstimate / 2), left, placement: p };
      }
    } else if (p === "bottom") {
      const top = rect.top + rect.height + POPOVER_OFFSET;
      if (top + popoverHeightEstimate <= vh - VIEWPORT_MARGIN) {
        return { top, left: clampH(rect.left + rect.width / 2 - POPOVER_W / 2), placement: p };
      }
    } else {
      const top = rect.top - popoverHeightEstimate - POPOVER_OFFSET;
      if (top >= VIEWPORT_MARGIN) {
        return { top, left: clampH(rect.left + rect.width / 2 - POPOVER_W / 2), placement: p };
      }
    }
  }

  // Last resort: clamp the preferred placement into the viewport.
  return {
    top: clampV(rect.top + rect.height + POPOVER_OFFSET),
    left: clampH(rect.left + rect.width / 2 - POPOVER_W / 2),
    placement: "bottom",
  };
}

export function TourOverlay() {
  const { isOpen, stepIndex, totalSteps, next, prev, skip, finish } = useTour();
  const step = TOUR_STEPS[stepIndex];
  const isIntro = !!step?.intro;
  const rect = useTargetRect(isIntro ? undefined : step?.target, isOpen);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverH, setPopoverH] = useState(220);

  useLayoutEffect(() => {
    if (popoverRef.current) {
      setPopoverH(popoverRef.current.offsetHeight);
    }
  }, [stepIndex, step?.id, rect]);

  const [vp, setVp] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const update = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (!isOpen || !step) return null;

  const pad = step.padding ?? PAD_DEFAULT;
  const cutout = rect && !isIntro
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  const pos =
    cutout && vp.w > 0
      ? computePopoverPosition(cutout, step.placement, vp.w, vp.h, popoverH)
      : null;

  const isLast = stepIndex === totalSteps - 1;

  return (
    <AnimatePresence>
      <motion.div
        key="tour-root"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[100]"
        aria-modal="true"
        role="dialog"
      >
        {/* SVG mask: full-screen dark layer with the target rect punched out. */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-auto"
          onClick={(e) => {
            // Click outside popover but inside backdrop: do nothing (avoid accidental skips)
            e.stopPropagation();
          }}
        >
          <defs>
            <mask id="tour-mask">
              <rect x={0} y={0} width="100%" height="100%" fill="white" />
              {cutout && (
                <motion.rect
                  initial={false}
                  animate={{
                    x: cutout.left,
                    y: cutout.top,
                    width: cutout.width,
                    height: cutout.height,
                  }}
                  transition={{ type: "spring", stiffness: 260, damping: 30 }}
                  rx={12}
                  ry={12}
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x={0}
            y={0}
            width="100%"
            height="100%"
            fill="rgba(20, 12, 8, 0.72)"
            mask="url(#tour-mask)"
          />
          {/* Glow ring around the cutout to draw attention. */}
          {cutout && (
            <motion.rect
              initial={false}
              animate={{
                x: cutout.left,
                y: cutout.top,
                width: cutout.width,
                height: cutout.height,
              }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              rx={12}
              ry={12}
              fill="none"
              stroke="#c9885a"
              strokeWidth={2}
              style={{ filter: "drop-shadow(0 0 12px rgba(201, 136, 90, 0.6))" }}
            />
          )}
        </svg>

        {/* Popover or intro card */}
        {isIntro ? (
          <IntroCard
            step={step}
            stepIndex={stepIndex}
            totalSteps={totalSteps}
            isLast={isLast}
            onNext={next}
            onSkip={skip}
            onFinish={finish}
          />
        ) : (
          pos && (
            <motion.div
              ref={popoverRef}
              key={step.id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1, top: pos.top, left: pos.left }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              style={{ width: POPOVER_W }}
              className="absolute rounded-2xl border border-border bg-card text-card-foreground shadow-2xl"
            >
              <StepCardContent
                step={step}
                stepIndex={stepIndex}
                totalSteps={totalSteps}
                isLast={isLast}
                onNext={next}
                onPrev={prev}
                onSkip={skip}
                onFinish={finish}
              />
            </motion.div>
          )
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function IntroCard({
  step,
  stepIndex,
  totalSteps,
  isLast,
  onNext,
  onSkip,
  onFinish,
}: {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  isLast: boolean;
  onNext: () => void;
  onSkip: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-4">
      <motion.div
        key={step.id}
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 280, damping: 28 }}
        className="w-full max-w-md rounded-2xl border border-border bg-card text-card-foreground shadow-2xl p-7"
      >
        <button
          type="button"
          aria-label="Skip tour"
          onClick={onSkip}
          className="absolute top-3 right-3 size-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
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
          {step.title}
        </h2>
        <p className="text-center text-sm text-muted-foreground mb-6">{step.body}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip tour
          </button>
          <button
            type="button"
            onClick={isLast ? onFinish : onNext}
            className="px-5 py-2 rounded-full bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors"
          >
            {isLast ? "Finish" : stepIndex === 0 ? "Let's take a tour" : "Continue"}
          </button>
        </div>
        <div className="mt-5 flex items-center justify-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={`size-1.5 rounded-full transition-colors ${
                i === stepIndex ? "bg-[#c9885a]" : "bg-border"
              }`}
            />
          ))}
        </div>
        <p className="mt-4 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Press Enter to continue · Esc to skip
        </p>
      </motion.div>
    </div>
  );
}

function StepCardContent({
  step,
  stepIndex,
  totalSteps,
  isLast,
  onNext,
  onPrev,
  onSkip,
  onFinish,
}: {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  isLast: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="size-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
            style={{ backgroundImage: "linear-gradient(135deg, #3b2418, #c9885a)" }}
          >
            {stepIndex + 1}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Step {stepIndex + 1} of {totalSteps}
          </span>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip tour
        </button>
      </div>

      <h3
        className="text-xl font-semibold tracking-tight mb-2"
        style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
      >
        {step.title}
      </h3>
      <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{step.body}</p>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={`size-1.5 rounded-full transition-colors ${
                i === stepIndex ? "bg-[#c9885a]" : "bg-border"
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={onPrev}
              className="px-3 py-1.5 rounded-full border border-border bg-background text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={isLast ? onFinish : onNext}
            className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:bg-foreground/90 transition-colors"
          >
            {isLast ? "Finish" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
