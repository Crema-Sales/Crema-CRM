import * as React from "react";

import { cn } from "@/lib/utils";

export function HelpSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
        {children}
      </div>
    </section>
  );
}

export function HelpTip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-l-2 border-[#c9885a] bg-[#c9885a]/5 pl-3 py-1.5 text-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function HelpKbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted/60">
      {children}
    </kbd>
  );
}

// Scrolls the section matching `activeAnchor` into view. Runs on a short
// timeout so the drawer's mount + layout settles before scrollIntoView fires;
// without the delay, the target element's offset is computed mid-animation
// and the scroll lands a few hundred pixels short.
export function useAnchorScroll(activeAnchor?: string) {
  React.useEffect(() => {
    if (!activeAnchor) return;
    const handle = window.setTimeout(() => {
      document
        .getElementById(activeAnchor)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 50);
    return () => window.clearTimeout(handle);
  }, [activeAnchor]);
}
