import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowLeft, Check } from "lucide-react";

export const Route = createFileRoute("/marketing/demo")({ component: DemoRequestPage });

const TEAM_SIZES = ["1–5", "6–25", "26–100", "100+"] as const;
const TIMELINES = ["Right now", "This quarter", "Next 6 months", "Exploring"] as const;

declare global {
  interface Window {
    crema?: {
      identify: (email: string, traits?: Record<string, unknown>) => void;
      track: (event: string, props?: Record<string, unknown>) => void;
    };
  }
}

function DemoRequestPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [teamSize, setTeamSize] = useState<(typeof TEAM_SIZES)[number]>("6–25");
  const [timeline, setTimeline] = useState<(typeof TIMELINES)[number]>("This quarter");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const traits = {
      full_name: name,
      company,
      role,
      team_size: teamSize,
      timeline,
    };
    // Fire identify + track via the loaded snippet. We dog-food our own product
    // here. These events land in /api/public/track and show up in the in-app
    // funnel scoped to the host org.
    try {
      window.crema?.identify(email, traits);
      window.crema?.track("demo_request_submitted", {
        ...traits,
        notes: notes || null,
      });
    } catch {
      // Snippet not loaded; fail silently, we still want to thank the lead.
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <section className="px-6 py-24 max-w-2xl mx-auto text-center space-y-4">
        <div className="mx-auto size-12 rounded-full bg-foreground text-background flex items-center justify-center">
          <Check className="size-6" />
        </div>
        <h1
          className="text-3xl md:text-4xl font-semibold tracking-tight"
          style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
        >
          We'll be in touch.
        </h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          Thanks, {name || "friend"}. A human from Crema will reach out within one business day.
          Until then, here's an espresso on us.
        </p>
        <Link
          to="/marketing"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mt-6"
        >
          <ArrowLeft className="size-4" /> Back to home
        </Link>
      </section>
    );
  }

  return (
    <section className="px-6 py-16 max-w-2xl mx-auto">
      <div className="space-y-2 mb-8">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Request a demo
        </p>
        <h1
          className="text-3xl md:text-4xl font-semibold tracking-tight"
          style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
        >
          See Crema, live.
        </h1>
        <p className="text-sm text-muted-foreground max-w-lg">
          Tell us a little about your team and we'll set up a tailored walkthrough.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Full name" required>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLS}
              autoComplete="name"
            />
          </Field>
          <Field label="Work email" required>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLS}
              autoComplete="email"
              placeholder="you@company.com"
            />
          </Field>
          <Field label="Company" required>
            <input
              required
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={INPUT_CLS}
              autoComplete="organization"
            />
          </Field>
          <Field label="Your role">
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={INPUT_CLS}
              placeholder="e.g. Head of Sales"
            />
          </Field>
          <Field label="Team size">
            <select
              value={teamSize}
              onChange={(e) => setTeamSize(e.target.value as (typeof TEAM_SIZES)[number])}
              className={INPUT_CLS}
            >
              {TEAM_SIZES.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Timeline">
            <select
              value={timeline}
              onChange={(e) => setTimeline(e.target.value as (typeof TIMELINES)[number])}
              className={INPUT_CLS}
            >
              {TIMELINES.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="What's prompting the evaluation?">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={INPUT_CLS}
            placeholder="(Optional) The shape of the problem you're trying to solve."
          />
        </Field>
        <div className="pt-2">
          <button
            type="submit"
            className="w-full md:w-auto inline-flex items-center justify-center px-6 py-3 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 transition-colors"
          >
            Request demo
          </button>
        </div>
      </form>
    </section>
  );
}

const INPUT_CLS =
  "w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1.5">
        {label}
        {required && <span className="text-orange-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
