import { useEffect, useRef, useState, type ReactNode } from "react";
import { Coffee } from "lucide-react";

/** Fade-in-on-scroll: returns a ref to attach and a className that flips once visible. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, className: seen ? "animate-in" : "opacity-0" };
}

/** Small mono uppercase label used above marketing headings. */
export const Eyebrow = ({ children }: { children: ReactNode }) => (
  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{children}</div>
);

export const serif = { fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" } as const;

/** Crema wordmark used in marketing headers and footers. */
export function Wordmark({ size = "base" }: { size?: "base" | "lg" }) {
  const cls = size === "lg" ? "text-2xl" : "text-xl";
  const iconCls = size === "lg" ? "size-6" : "size-5";
  return (
    <span className={`inline-flex items-center gap-2 ${cls} font-bold tracking-tight text-foreground`}>
      <Coffee className={`${iconCls} shrink-0`} style={{ color: "#c9885a" }} />
      <span>Crema<span style={{ color: "#c9885a" }}>.</span></span>
    </span>
  );
}
