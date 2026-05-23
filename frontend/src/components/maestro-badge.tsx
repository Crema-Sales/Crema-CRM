import { cn } from "@/lib/utils";

export function MaestroBadge({ className }: { className?: string }) {
  return (
    <a
      href="https://runmaestro.ai"
      target="_blank"
      rel="noreferrer"
      aria-label="Made with Maestro"
      className={cn(
        "inline-flex items-center gap-2 rounded border border-border bg-card/60 px-3 py-1.5 text-[10px] uppercase tracking-[0.24em] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5 shrink-0"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M6 10L10 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M9.4 3.8L12.2 6.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M3.8 9.4L6.6 12.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M3 4.2V2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M2.2 3.4H3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M13 13.5V11.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M12.2 12.6H13.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      made with maestro
    </a>
  );
}
