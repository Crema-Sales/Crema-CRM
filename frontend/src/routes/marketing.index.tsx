import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Coffee, Flame, Sparkles, Award } from "lucide-react";

export const Route = createFileRoute("/marketing/")({ component: MarketingLanding });

function MarketingLanding() {
  return (
    <>
      <section className="px-6 py-24 max-w-6xl mx-auto">
        <div className="max-w-3xl space-y-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            AI-native sales CRM
          </p>
          <h1
            className="text-5xl md:text-6xl font-semibold tracking-tight"
            style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
          >
            Coffee is for closers.
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
            A CRM for sales teams that win on relationships. Crema handles the data plumbing:
            pipeline, follow-ups, signals. You focus on the people on the other end of the
            deal.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              to="/marketing/demo"
              className="inline-flex items-center gap-2 px-5 py-3 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 transition-colors"
            >
              Request a demo <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-5 py-3 border border-border rounded-lg text-sm font-bold hover:bg-muted/40 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 pb-24 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <FeatureCard
            icon={<Sparkles className="size-5" style={{ color: "#c9885a" }} />}
            title="The Funnel"
            body="A relationship view that moves itself. Finish the right work, the deal advances."
          />
          <FeatureCard
            icon={<Coffee className="size-5" style={{ color: "#c9885a" }} />}
            title="Today"
            body="Who needs you today, in priority order. Open the app and start the conversation."
          />
          <FeatureCard
            icon={<Flame className="size-5" style={{ color: "#c9885a" }} />}
            title="Cross-property signal"
            body="Every customer touch in one timeline, so every conversation picks up where the last one left off."
          />
          <FeatureCard
            icon={<Award className="size-5" style={{ color: "#c9885a" }} />}
            title="Per-rep copilot"
            body="An AI that knows your customers as well as you do, and drafts the next move so you can keep selling."
          />
        </div>
      </section>
    </>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border p-5 bg-card">
      <div className="mb-3">{icon}</div>
      <h3 className="text-sm font-semibold mb-1.5">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
