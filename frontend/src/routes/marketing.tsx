import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { Coffee, Github } from "lucide-react";
import { MaestroBadge } from "@/components/maestro-badge";

export const Route = createFileRoute("/marketing")({
  head: () => ({
    meta: [
      { title: "Crema: Coffee is for closers" },
      {
        name: "description",
        content:
          "Crema is the CRM built around customer relationships. Pipeline, prioritized work, and AI follow-ups, so reps spend their day on people, not data entry.",
      },
    ],
  }),
  component: MarketingShell,
});

function MarketingShell() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/marketing" className="flex items-center gap-2 group">
            <Coffee className="size-6 shrink-0" style={{ color: "#c9885a" }} />
            <span className="text-2xl font-bold tracking-tight">
              Crema<span style={{ color: "#c9885a" }}>.</span>
            </span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <a
              href="https://github.com/Crema-Sales/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Source code on GitHub"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="size-5 shrink-0" />
            </a>
            <Link
              to="/marketing/demo"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Request demo
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center px-3 py-1.5 bg-foreground text-background rounded-md text-xs font-bold hover:bg-foreground/90 transition-colors"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="border-t border-border mt-24">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-4">
          <div className="text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono uppercase tracking-widest">crema sales · v1.0</span>
            <span>© Crema, Inc. cremasales.com</span>
            <Link to="/investors" className="hover:text-foreground transition-colors">
              Investors
            </Link>
            <span>
              Made with <span className="text-sm align-middle">💜</span> in Portland, Oregon
            </span>
          </div>
          <div className="flex justify-center">
            <MaestroBadge />
          </div>
        </div>
      </footer>
    </div>
  );
}
