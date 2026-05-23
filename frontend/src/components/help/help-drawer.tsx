"use client";

import * as React from "react";
import { Maximize2, Minimize2, Pin, PinOff, ThumbsDown, ThumbsUp } from "lucide-react";

import { useHelp } from "@/hooks/use-help";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DefaultHelpContent } from "@/components/help/default-help";
import { pushHelpFeedback } from "@/components/help/help-storage";
import { cn } from "@/lib/utils";

type FeedbackState = "pending" | "thanks" | "hidden";

const THANKS_DURATION_MS = 2000;

type HelpBodyContent = {
  feedbackId: string;
  title: string;
  eyebrow?: string;
  ContentComponent?: React.ComponentType<{ activeAnchor?: string }>;
  activeAnchor?: string;
};

function useHelpBodyContent(): HelpBodyContent {
  const { content, state } = useHelp();
  return {
    feedbackId: content?.id ?? "welcome",
    title: content?.title ?? "Welcome to Crema",
    eyebrow: content ? content.eyebrow : "crema / help",
    ContentComponent: content?.component,
    activeAnchor: state.activeAnchor,
  };
}

/**
 * Encapsulates the thumbs-up/down feedback strip. The reset-on-topic-change
 * behavior matches the spec: "hidden until the user navigates away and back",
 * which we model by keying the state to `feedbackId`.
 */
function FeedbackStrip({ feedbackId, className }: { feedbackId: string; className?: string }) {
  const [feedbackState, setFeedbackState] = React.useState<FeedbackState>("pending");
  const thanksTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setFeedbackState("pending");
    if (thanksTimerRef.current) {
      clearTimeout(thanksTimerRef.current);
      thanksTimerRef.current = null;
    }
  }, [feedbackId]);

  React.useEffect(() => {
    return () => {
      if (thanksTimerRef.current) clearTimeout(thanksTimerRef.current);
    };
  }, []);

  const handleFeedback = React.useCallback(
    (value: "up" | "down") => {
      if (feedbackState !== "pending") return;
      pushHelpFeedback({ topic: feedbackId, value });
      setFeedbackState("thanks");
      if (thanksTimerRef.current) clearTimeout(thanksTimerRef.current);
      thanksTimerRef.current = setTimeout(() => {
        setFeedbackState("hidden");
        thanksTimerRef.current = null;
      }, THANKS_DURATION_MS);
    },
    [feedbackId, feedbackState],
  );

  if (feedbackState === "hidden") return null;

  return (
    <div
      className={cn(
        "border-t border-border px-6 py-3 flex items-center justify-between gap-3 bg-background",
        className,
      )}
    >
      {feedbackState === "pending" ? (
        <>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            was this helpful?
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleFeedback("up")}
              aria-label="Mark help as helpful"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ThumbsUp className="size-3.5" />
              Yes
            </button>
            <button
              type="button"
              onClick={() => handleFeedback("down")}
              aria-label="Mark help as not helpful"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ThumbsDown className="size-3.5" />
              No
            </button>
          </div>
        </>
      ) : (
        <div role="status" aria-live="polite" className="text-xs text-muted-foreground">
          Thanks — that helps us prioritize.
        </div>
      )}
    </div>
  );
}

function HeaderButton({
  onClick,
  ariaLabel,
  children,
  className,
}: {
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground opacity-70 transition-opacity hover:text-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ring-offset-background cursor-pointer",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function HelpDrawer() {
  const { state, setOpen, setExpanded, setPinned } = useHelp();
  const { open, expanded, pinned } = state;
  const { feedbackId, title, eyebrow, ContentComponent, activeAnchor } = useHelpBodyContent();

  // When pinned, the docked panel (rendered by `HelpDockedPanel`) is the
  // visible surface. Suppress the modal Sheet so we don't render two copies
  // of the same content.
  if (pinned) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className={cn(
          // `motion-reduce:transition-none` honors `prefers-reduced-motion`
          // and drops the expand/collapse width transition for users who've
          // opted out of motion. Radix's open/close slide is left alone — the
          // spec scope is the width transition only.
          "overflow-x-hidden transition-[width,max-width] duration-300 motion-reduce:transition-none",
          "w-full sm:w-[420px] sm:max-w-[420px]",
          expanded && "sm:w-[min(50vw,720px)] sm:max-w-[720px]",
        )}
      >
        <div className="absolute right-12 top-4 hidden sm:flex items-center gap-1">
          <HeaderButton
            onClick={() => setPinned(true)}
            ariaLabel="Pin help panel to the side"
          >
            <Pin className="h-4 w-4" />
          </HeaderButton>
          <HeaderButton
            onClick={() => setExpanded(!expanded)}
            ariaLabel={expanded ? "Collapse help drawer" : "Expand help drawer"}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </HeaderButton>
        </div>

        <SheetHeader className="pr-24 space-y-1">
          {eyebrow && (
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {eyebrow}
            </div>
          )}
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">
            Contextual help for the current page.
          </SheetDescription>
        </SheetHeader>

        <div className="-mr-6 pr-6 overflow-y-auto h-[calc(100vh-8rem)]">
          {ContentComponent ? (
            <ContentComponent activeAnchor={activeAnchor} />
          ) : (
            <DefaultHelpContent />
          )}
        </div>

        <FeedbackStrip feedbackId={feedbackId} className="-mx-6 -mb-6 mt-auto" />
      </SheetContent>
    </Sheet>
  );
}

/**
 * Docked variant of the help panel. Rendered as a flex sibling of the main
 * content column when `pinned` is true. Stays open across navigation and
 * updates its body whenever the active route registers new help content.
 */
export function HelpDockedPanel() {
  const { state, setExpanded, setPinned } = useHelp();
  const { expanded, pinned } = state;
  const { feedbackId, title, eyebrow, ContentComponent, activeAnchor } = useHelpBodyContent();

  if (!pinned) return null;

  return (
    <aside
      aria-label="Help"
      className={cn(
        "hidden sm:flex shrink-0 flex-col bg-background border-l border-border",
        // Stays visible alongside scrolling main content. The outer layout is
        // `flex min-h-screen` so `sticky top-0 h-screen` keeps this aside
        // glued to the viewport's right side.
        "sticky top-0 h-screen overflow-hidden",
        "transition-[width,max-width] duration-300 motion-reduce:transition-none",
        "w-[420px] max-w-[420px]",
        expanded && "w-[min(50vw,720px)] max-w-[720px]",
      )}
    >
      <div className="relative px-6 pt-6 pb-2 space-y-1">
        <div className="absolute right-4 top-4 flex items-center gap-1">
          <HeaderButton
            onClick={() => setExpanded(!expanded)}
            ariaLabel={expanded ? "Collapse help panel" : "Expand help panel"}
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </HeaderButton>
          <HeaderButton
            onClick={() => setPinned(false)}
            ariaLabel="Unpin help panel"
          >
            <PinOff className="h-4 w-4" />
          </HeaderButton>
        </div>
        <div className="pr-20 space-y-1">
          {eyebrow && (
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {eyebrow}
            </div>
          )}
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4">
        {ContentComponent ? (
          <ContentComponent activeAnchor={activeAnchor} />
        ) : (
          <DefaultHelpContent />
        )}
      </div>

      <FeedbackStrip feedbackId={feedbackId} />
    </aside>
  );
}
