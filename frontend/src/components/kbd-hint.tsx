import { cn } from "@/lib/utils";
import { formatKeys, useHintsVisible } from "@/hooks/use-shortcuts";

type KbdHintProps = {
  keys: string;
  size?: "xs" | "sm";
  tone?: "muted" | "accent";
  /** Render even when ambient hints are toggled off (palette, help dialog). */
  force?: boolean;
  className?: string;
};

function formatCombo(keys: string): string {
  const chips = formatKeys(keys);
  // Chord sequences ("g f" → ["G", "F"]) keep a visible separator so they read
  // as "G then F". Modifier combos ("mod+k" → ["⌘", "K"]) collapse to one chip.
  const isChord = keys.trim().includes(" ") && !keys.includes("+");
  return isChord ? chips.join(" ") : chips.join("");
}

export function KbdHint({ keys, size = "xs", tone = "muted", force, className }: KbdHintProps) {
  const visible = useHintsVisible();
  if (!force && !visible) return null;
  const label = formatCombo(keys);
  return (
    <kbd
      aria-label={`Shortcut: ${label}`}
      className={cn(
        "font-mono leading-none rounded-md inline-flex items-center justify-center border align-middle select-none",
        size === "xs"
          ? "text-[11px] px-1.5 h-5 min-w-[1.25rem]"
          : "text-xs px-2 h-6 min-w-[1.5rem]",
        tone === "muted"
          ? "border-border bg-background text-foreground/80 shadow-[0_1px_0_var(--color-border)]"
          : "border-[#c9885a]/50 bg-gradient-to-b from-[#fbf1e3] to-[#f1d9b8] text-[#5a3416] shadow-[0_1px_0_rgba(122,74,40,0.35)] dark:from-[#3a2618] dark:to-[#2a1a10] dark:text-[#f1d9b8]",
        className,
      )}
    >
      {label}
    </kbd>
  );
}
