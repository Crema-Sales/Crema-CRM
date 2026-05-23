import { createFileRoute, Link } from "@tanstack/react-router";
import {
  createContext, useContext, useEffect, useState, type FormEvent,
} from "react";
import {
  ArrowRight, Mail, Globe, Inbox, Sparkles, ListChecks,
  Eye, ShieldCheck, Coffee, Check, Clock, Phone, FileText, Zap, Flame, Award,
  LifeBuoy, X, ChevronLeft, MessageSquarePlus, Loader2, Github,
} from "lucide-react";
import { toast } from "sonner";
import {
  appendSupportTicketMessage,
  getSupportTicketThread,
  requestDemo,
  subscribeNewsletter,
  submitSupportTicket,
} from "@/auth/marketing-fns";
import { Eyebrow, serif, useReveal, Wordmark } from "@/components/marketing-ui";
import { MaestroBadge } from "@/components/maestro-badge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CremaSales: Build customer relationships, not records" },
      { name: "description", content: "Focus on customer relationships. We'll take care of the data. Every email, call, and signal flows in automatically, so you can spend your day on the people who matter." },
      // Open Graph — controls the link card in Slack, iMessage, LinkedIn, etc.
      { property: "og:site_name", content: "CremaSales" },
      { property: "og:title", content: "CremaSales: Build customer relationships, not records" },
      { property: "og:description", content: "Spend your day on customers, not screens. A prioritized list of who to call, what to send, who to thank." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://cremasales.com/" },
      { property: "og:image", content: "https://cremasales.com/og-image.png" },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Crema: Build customer relationships, not records." },
      // Twitter / X
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "CremaSales: Build customer relationships, not records" },
      { name: "twitter:description", content: "Spend your day on customers, not screens. A prioritized list of who to call, what to send, who to thank." },
      { name: "twitter:image", content: "https://cremasales.com/og-image.png" },
      { name: "twitter:image:alt", content: "Crema: Build customer relationships, not records." },
    ],
  }),
  component: HomePage,
});

/* ----------------------------- helpers ----------------------------- */

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ------------------------------- page ------------------------------ */

function HomePage() {
  return (
    <SupportProvider>
      <div className="min-h-screen bg-background text-foreground antialiased selection:bg-accent/40">
        <TopBar />
        <Hero />
        <Problem />
        <Wedges />
        <ProductDeepDive />
        <Testimonials />
        <HowItWorks />
        <Extension />
        <EmailCapture />
        <DemoRequest />
        <FinalBand />
        <FooterEl />
        <SupportLauncher />
      </div>
    </SupportProvider>
  );
}

/* ------------------------------- top bar --------------------------- */

function TopBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`sticky top-0 z-50 transition-colors backdrop-blur-md ${scrolled ? "bg-background/85 border-b border-border" : "bg-transparent"}`}>
      <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#top" onClick={(e) => { e.preventDefault(); scrollTo("top"); }} className="flex items-center gap-2 group">
          <Wordmark />
        </a>
        <nav className="hidden md:flex items-center gap-7 text-sm">
          <button onClick={() => scrollTo("story")} className="text-muted-foreground hover:text-foreground transition-colors">Story</button>
          <button onClick={() => scrollTo("product")} className="text-muted-foreground hover:text-foreground transition-colors">Product</button>
          <button onClick={() => scrollTo("how")} className="text-muted-foreground hover:text-foreground transition-colors">How it works</button>
          <button onClick={() => scrollTo("extension")} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
            Extension
            <span className="font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded-full border border-accent/40 bg-accent/15 text-accent leading-none">
              Beta
            </span>
          </button>
          <SupportNavButton className="text-muted-foreground hover:text-foreground transition-colors">Support</SupportNavButton>
          <a
            href="https://github.com/Crema-Sales/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            Source <Github className="size-4 shrink-0" aria-hidden />
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground hidden sm:inline">Log in</Link>
          <button
            onClick={() => scrollTo("demo")}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:bg-accent/90 transition-colors shadow-sm"
          >
            Request a demo <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}

/* --------------------------------- hero ---------------------------- */

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* warm ambient smoke layers */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-24 size-[480px] rounded-full opacity-60 blur-3xl"
             style={{ background: "radial-gradient(closest-side, color-mix(in oklab, var(--accent) 35%, transparent), transparent)", animation: "smokeDriftA 18s ease-in-out infinite" }} />
        <div className="absolute top-20 right-[-120px] size-[520px] rounded-full opacity-50 blur-3xl"
             style={{ background: "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 25%, transparent), transparent)", animation: "smokeDriftB 22s ease-in-out infinite" }} />
      </div>

      <div className="relative max-w-[1200px] mx-auto px-6 pt-20 pb-24 md:pt-32 md:pb-32 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-14 items-center">
        <div>
          <Eyebrow>A CRM for people who sell by building relationships</Eyebrow>
          <h1 className="mt-5 text-6xl md:text-8xl tracking-tight leading-[0.95] text-foreground font-medium" style={serif}>
            Show up for your <em className="not-italic text-accent">customers.</em>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed">
            Sales isn't paperwork. It's people. Crema captures every signal in the background so you can focus on the conversations that close.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link to="/login" search={{ mode: "signup" }} className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-6 py-3 font-medium hover:bg-accent/90 transition-colors shadow-sm">
              Sign up <ArrowRight className="size-4" />
            </Link>
            <button onClick={() => scrollTo("product")} className="inline-flex items-center gap-2 rounded-full border border-foreground/20 text-foreground px-6 py-3 font-medium hover:border-foreground/40 hover:bg-foreground/[0.03] transition-colors">
              See how it works ↓
            </button>
          </div>

          <div className="mt-12 pt-6 border-t border-border">
            <Eyebrow>Built by operators who've used every CRM you have</Eyebrow>
          </div>
        </div>

        <HeroStill />
      </div>
    </section>
  );
}

function HeroStill() {
  const streams = [
    { icon: Mail, label: "Email" },
    { icon: Globe, label: "Web visit" },
    { icon: Inbox, label: "Support" },
  ];
  return (
    <div className="relative h-[480px] hidden md:block">
      {/* sources */}
      <div className="absolute top-0 left-0 right-0 flex justify-between px-6">
        {streams.map((s, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="size-12 rounded-full bg-card border border-border flex items-center justify-center shadow-sm">
              <s.icon className="size-5 text-muted-foreground" />
            </div>
            <Eyebrow>{s.label}</Eyebrow>
            {/* pour */}
            <div className="relative w-px h-32 overflow-hidden">
              {[0, 0.4, 0.8, 1.2, 1.6].map((delay, k) => (
                <span key={k} className="absolute left-1/2 -translate-x-1/2 top-0 size-1.5 rounded-full bg-accent/80"
                      style={{ animation: `steamRise 1.6s ease-in ${delay + i * 0.15}s infinite reverse` }} />
              ))}
              <div className="absolute inset-0 bg-gradient-to-b from-accent/0 via-accent/30 to-accent/0" />
            </div>
          </div>
        ))}
      </div>

      {/* the record card */}
      <div className="absolute bottom-0 left-0 right-0 rounded-2xl border border-border bg-card shadow-[0_30px_60px_-30px_color-mix(in_oklab,var(--foreground)_25%,transparent)] p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold">Sarah Chen</div>
            <Eyebrow>VP Ops · GreenLeaf Inc.</Eyebrow>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border border-accent/40 bg-accent/15 text-accent-foreground">deal · closing</span>
        </div>
        <ul className="space-y-2.5">
          {[
            { icon: Mail, t: "Re: Pricing structure", s: "email · 2m ago" },
            { icon: Globe, t: "Viewed /pricing 3 times", s: "web · 12m ago" },
            { icon: Phone, t: "Outbound call · 14:02", s: "call · today" },
            { icon: FileText, t: "Proposal v2 sent", s: "doc · yesterday" },
          ].map((row, i) => (
            <li key={i} className="flex items-center gap-3 text-sm">
              <div className="size-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                <row.icon className="size-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0 truncate">{row.t}</div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{row.s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------- problem --------------------------- */

function Problem() {
  const r = useReveal<HTMLDivElement>();
  const quotes = [
    { q: "Crushed my quota, but got chewed out for not logging WhatsApp chats. Are we closers or data entry monkeys?", who: "Senior AE, fintech" },
    { q: "If it isn't in Salesforce, it didn't happen.", who: "Sales manager, B2B SaaS" },
    { q: "My clients don't use corporate email anymore. They text me. The CRM doesn't see any of it.", who: "Enterprise AE, infra" },
  ];
  return (
    <section id="story" className="border-t border-border bg-secondary/40">
      <div ref={r.ref} className={`max-w-[1200px] mx-auto px-6 py-24 md:py-32 ${r.className}`}>
        <div className="max-w-3xl">
          <Eyebrow>The problem</Eyebrow>
          <h2 className="mt-4 text-4xl md:text-6xl tracking-tight leading-[1.05] font-medium" style={serif}>
            You weren't hired to type. You were hired to know your customers.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            We pulled the top complaints from r/sales, r/salesforce, and a stack of G2 reviews. The pattern is loud.
          </p>
        </div>
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
          {quotes.map((c, i) => (
            <figure key={i} className="rounded-2xl border border-border bg-card p-7">
              <Coffee className="size-4 text-accent mb-4" />
              <blockquote className="text-base leading-relaxed text-foreground">"{c.q}"</blockquote>
              <figcaption className="mt-5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{c.who}</figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-14 text-2xl md:text-3xl italic text-foreground/80 max-w-2xl" style={serif}>
          Every legacy CRM treats the rep as the input device. We don't.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------- wedges ---------------------------- */

function Wedges() {
  const r = useReveal<HTMLDivElement>();
  const cards = [
    { icon: Zap, t: "Every signal captured. So every conversation lands warm.",
      b: "Email, calendar, calls, web visits, support. All of it stitched onto one customer timeline. Walk into every call already knowing where you left off." },
    { icon: ListChecks, t: "Open the app, see your people.",
      b: "\"Good morning. Here's who needs you today.\" One prioritized list, ranked by relationship, not by stage, not by a counter on a dashboard. Start with the customer at the top." },
    { icon: Sparkles, t: "An AI that helps you show up, not write reports.",
      b: "Drafts the follow-up email, surfaces the customer's last three touchpoints, watches your browser. Your copilot serves the relationship, not the database." },
    { icon: Eye, t: "Every action shows its work.",
      b: "Why is this customer at the top? Crema tells you: the open ticket, the unanswered email, the renewal in nine days. No black boxes between you and the relationship." },
  ];
  return (
    <section className="border-t border-border">
      <div ref={r.ref} className={`max-w-[1200px] mx-auto px-6 py-24 md:py-32 ${r.className}`}>
        <div className="max-w-3xl">
          <Eyebrow>Four wedges</Eyebrow>
          <h2 className="mt-4 text-4xl md:text-6xl tracking-tight leading-[1.05] font-medium" style={serif}>
            Four ways we keep you in front of customers.
          </h2>
        </div>
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-5">
          {cards.map((c, i) => (
            <div key={i} className="group rounded-2xl border border-border bg-card p-8 hover:border-foreground/30 transition-colors">
              <div className="flex items-center gap-3 mb-5">
                <div className="size-10 rounded-xl bg-accent/15 text-accent-foreground flex items-center justify-center">
                  <c.icon className="size-5 text-accent" />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">0{i + 1}</span>
              </div>
              <h3 className="text-xl font-semibold tracking-tight text-foreground">{c.t}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- product ----------------------------- */

function ProductDeepDive() {
  return (
    <section id="product" className="border-t border-border bg-secondary/30">
      <div className="max-w-[1200px] mx-auto px-6 py-24 md:py-32 space-y-28">
        <ProductBlock
          eyebrow="The Morning Cup"
          headline="Your day, poured fresh."
          body="One prioritized list. Each row is a verb, a subject, and a reason. Sorted by a computed priority score combining open ticket SLAs, lead score, days since last contact, and ideal-customer flags. AI-ranked rows say so. Deterministic rows don't pretend to be."
          visual={<MorningCupStill />}
        />
        <ProductBlock
          reversed
          eyebrow="One timeline per customer"
          headline="Know them before they pick up the phone."
          body="Walk into every call with the full story. Every email, click, ticket, and call already on their record. A single ingest pipe stitches anonymous web visits to the email signups they convert into, so the relationship picks up where it left off, not where the form did."
          visual={<TimelineStill />}
        />
        <ProductBlock
          eyebrow="Pipelines"
          headline="Every relationship, down the coffee filter."
          body="Leads in at the top. Customers out the bottom. Each stage narrows the field; finish the required tasks and the relationship drips down on its own. No drag-and-drop kanban gymnastics, no sticky-note theatre. The filter does the sorting; you do the brewing."
          visual={<FunnelStill />}
        />
        <ProductBlock
          reversed
          eyebrow="Tickets"
          headline="Inline on the record, where they belong."
          body="SLAs, escalations, history: right on the customer record. A red chip when a ticket is past SLA. Reps see what support sees; support sees what reps see. One database, one view."
          visual={<TicketsStill />}
        />
      </div>
    </section>
  );
}

function ProductBlock({ eyebrow, headline, body, visual, reversed }: { eyebrow: string; headline: string; body: string; visual: React.ReactNode; reversed?: boolean }) {
  const r = useReveal<HTMLDivElement>();
  return (
    <div ref={r.ref} className={`grid grid-cols-1 lg:grid-cols-2 gap-14 items-center ${r.className}`}>
      <div className={reversed ? "lg:order-2" : ""}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="mt-4 text-4xl md:text-5xl tracking-tight leading-[1.05] font-medium" style={serif}>{headline}</h3>
        <p className="mt-5 text-base md:text-lg text-muted-foreground leading-relaxed max-w-lg">{body}</p>
        <button onClick={() => scrollTo("demo")} className="mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:gap-2 transition-all">
          Request a demo <ArrowRight className="size-4" />
        </button>
      </div>
      <div className={reversed ? "lg:order-1" : ""}>{visual}</div>
    </div>
  );
}

function MorningCupStill() {
  const rows = [
    { v: "Call", who: "Sarah Chen · GreenLeaf Inc.", why: "opened pricing 3× this week · ticket pending 4d", due: "Due 3:00 PM", ai: true },
    { v: "Email", who: "Marcus Hale · Northwind", why: "no contact in 11 days · stage: proposal", due: "Today", ai: false },
    { v: "Renew", who: "Helix Lab · annual contract", why: "auto-renew in 9 days · NPS 9", due: "This week", ai: true },
    { v: "Follow-up", who: "Orbit Logic · ticket #482", why: "SLA breach risk in 6h", due: "By 5:00 PM", ai: false },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card shadow-[0_30px_60px_-30px_color-mix(in_oklab,var(--foreground)_20%,transparent)] overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-background/60">
        <div className="flex items-center gap-2">
          <Coffee className="size-4 text-accent" />
          <span className="text-sm font-semibold">Morning Cup</span>
        </div>
        <Eyebrow>Tuesday · 9:14 AM</Eyebrow>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r, i) => (
          <li key={i} className="px-5 py-4 flex items-start gap-4 hover:bg-foreground/[0.02] transition-colors">
            <div className="size-8 rounded-md bg-accent/15 flex items-center justify-center shrink-0">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">{i + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm"><span className="font-semibold">{r.v}</span> {r.who}</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.why}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{r.due}</span>
              {r.ai && <span className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-accent/40 bg-accent/10 text-accent">AI-ranked</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimelineStill() {
  const items = [
    { icon: Globe, t: "Visited /pricing", s: "web · anon_x84", time: "9:02" },
    { icon: Mail, t: "Opened \"Q2 follow-up\"", s: "email pixel", time: "9:08" },
    { icon: Inbox, t: "Submitted demo form", s: "marketing site → ingest", time: "9:11" },
    { icon: Sparkles, t: "Identity merged → Sarah Chen", s: "system", time: "9:11" },
    { icon: Phone, t: "Outbound call · 4m 22s", s: "manual log · Alex", time: "10:30" },
    { icon: FileText, t: "Proposal v2 sent", s: "doc · auto-attached", time: "Yesterday" },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <Eyebrow>Customer · Sarah Chen</Eyebrow>
      <ul className="mt-5 relative space-y-4 pl-5 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-border">
        {items.map((it, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-5 top-1 size-3 rounded-full border-2 border-card bg-accent" />
            <div className="flex items-start gap-2">
              <it.icon className="size-3.5 mt-1 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm">{it.t}</p>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{it.s} · {it.time}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FunnelStill() {
  const stages: { key: string; label: string; icon: any; count: number; widthPct: number; dark?: boolean }[] = [
    { key: "lead",     label: "Lead",     icon: Sparkles, count: 24, widthPct: 100 },
    { key: "contact",  label: "Contact",  icon: Coffee,   count: 11, widthPct: 82 },
    { key: "deal",     label: "Deal",     icon: Flame,    count: 5,  widthPct: 62 },
    { key: "customer", label: "Customer", icon: Award,    count: 2,  widthPct: 44, dark: true },
  ];
  const tints: Record<string, string> = {
    lead:     "linear-gradient(135deg, color-mix(in oklab, var(--accent) 8%, var(--card)), var(--card))",
    contact:  "linear-gradient(135deg, color-mix(in oklab, var(--accent) 22%, var(--card)), var(--card))",
    deal:     "linear-gradient(135deg, color-mix(in oklab, var(--accent) 45%, var(--card)), color-mix(in oklab, var(--accent) 12%, var(--card)))",
    customer: "linear-gradient(135deg, #3b2418, #c9885a)",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[0_30px_60px_-30px_color-mix(in_oklab,var(--foreground)_20%,transparent)]">
      <div className="space-y-3">
        {stages.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.key} className="relative">
              <div
                className="rounded-xl border border-border overflow-hidden"
                style={{ background: tints[s.key], width: `${s.widthPct}%`, marginLeft: `${(100 - s.widthPct) / 2}%` }}
              >
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`size-7 rounded-md flex items-center justify-center ${s.dark ? "bg-white/15 text-white" : "bg-background/60 text-foreground"}`}>
                      <Icon className="size-3.5" />
                    </div>
                    <span className={`text-xl tracking-tight font-medium ${s.dark ? "text-white" : ""}`} style={serif}>{s.label}</span>
                  </div>
                  <span className={`text-2xl tabular-nums font-medium ${s.dark ? "text-white" : "text-foreground"}`} style={serif}>{s.count}</span>
                </div>
              </div>
              {i < stages.length - 1 && (
                <div className="flex justify-center my-0.5">
                  <ArrowRight className="size-4 rotate-90 text-muted-foreground" />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-3 border-t border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground text-center">
        Finish the stage's tasks → it drips down on its own
      </div>
    </div>
  );
}

function TicketsStill() {
  const tickets = [
    { s: "Pricing question on Enterprise plan", p: "high", st: "open", sla: "breached" },
    { s: "SSO setup follow-up", p: "medium", st: "pending", sla: "due 2h" },
    { s: "Refund request (closed)", p: "low", st: "resolved", sla: "" },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-background/60">
        <div>
          <div className="text-sm font-semibold">GreenLeaf Inc.</div>
          <Eyebrow>Tickets · 3 active</Eyebrow>
        </div>
        <Inbox className="size-4 text-muted-foreground" />
      </div>
      <ul className="divide-y divide-border">
        {tickets.map((t, i) => (
          <li key={i} className="px-5 py-4 flex items-center gap-3">
            <div className="size-7 rounded-md bg-muted flex items-center justify-center shrink-0">
              <Inbox className="size-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{t.s}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{t.p} · {t.st}</span>
                {t.sla === "breached" && <span className="font-mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-destructive/40 bg-destructive/15 text-destructive">SLA breached</span>}
                {t.sla && t.sla !== "breached" && <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">· {t.sla}</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------ extension -------------------------- */

function Extension() {
  const r = useReveal<HTMLDivElement>();
  const feats = [
    { icon: Eye, t: "Ambient capture", b: "The extension watches the tabs you tell it to and emits activity events to your CRM record. No copy-paste. No \"log a call\" modal." },
    { icon: Sparkles, t: "Hand it the keys", b: "Tag a session as autonomous and your copilot picks up the cursor: research prospects, draft replies, pre-fill forms, build a hit list, while you're on a call." },
    { icon: ShieldCheck, t: "You're always in control", b: "A toolbar light shows when the extension is recording or driving. One click pauses everything. Per-site allow-list, no surprises." },
  ];
  return (
    <section id="extension" className="border-t border-border">
      <div ref={r.ref} className={`max-w-[1200px] mx-auto px-6 py-24 md:py-32 ${r.className}`}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Eyebrow>The browser extension</Eyebrow>
              <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-accent/40 bg-accent/15 text-accent">
                Beta
              </span>
            </div>
            <h2 className="mt-4 text-3xl md:text-5xl font-serif tracking-tight leading-[1.05]">
              Work where your customers are. The CRM follows.
            </h2>
            <p className="mt-5 text-lg text-muted-foreground max-w-lg">
              The Crema extension is your copilot's eyes and hands. Browse like you always do (LinkedIn, Gmail, your product, anywhere the work happens) and the CRM updates around you.
            </p>
            <p className="mt-3 text-sm text-muted-foreground max-w-lg italic">
              Heads up: the extension is in <strong className="not-italic text-foreground">beta</strong> and under active development. Expect rough edges, frequent updates, and the occasional behavior change while we harden it.
            </p>
            <Link to="/extension" className="mt-7 inline-flex items-center gap-2 rounded-full border border-foreground/20 px-5 py-2.5 text-sm font-medium hover:border-foreground/40 transition-colors">
              Install the extension <ArrowRight className="size-4" />
            </Link>
          </div>
          <BrowserFrame />
        </div>
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-5">
          {feats.map((f, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-6">
              <div className="size-9 rounded-xl bg-accent/15 flex items-center justify-center mb-4">
                <f.icon className="size-4 text-accent" />
              </div>
              <h4 className="text-base font-semibold">{f.t}</h4>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BrowserFrame() {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-[0_30px_60px_-30px_color-mix(in_oklab,var(--foreground)_20%,transparent)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/60">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-destructive/60" />
          <span className="size-2.5 rounded-full bg-accent/60" />
          <span className="size-2.5 rounded-full bg-primary/40" />
        </div>
        <div className="flex-1 ml-3 h-6 rounded-md bg-background border border-border flex items-center px-3 font-mono text-[10px] text-muted-foreground">
          mail.google.com
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30">
          <span className="size-1.5 rounded-full bg-accent animate-pulse" />
          <span className="font-mono text-[9px] uppercase tracking-widest text-accent">recording</span>
        </div>
      </div>
      <div className="grid grid-cols-2 min-h-[320px]">
        <div className="p-4 border-r border-border space-y-2">
          <Eyebrow>Inbox</Eyebrow>
          {["Re: Pricing structure · Sarah Chen", "Demo follow-up · Marcus Hale", "Contract redlines · Legal"].map((s, i) => (
            <div key={i} className={`text-xs p-2.5 rounded-md border ${i === 0 ? "bg-accent/10 border-accent/30" : "border-border bg-background"}`}>
              <div className="font-medium truncate">{s}</div>
              <div className="font-mono text-[10px] text-muted-foreground mt-0.5">2m ago</div>
            </div>
          ))}
        </div>
        <div className="p-4 bg-background/60">
          <div className="flex items-center justify-between mb-3">
            <Eyebrow>CremaSales · live</Eyebrow>
            <span className="size-1.5 rounded-full bg-accent animate-pulse" />
          </div>
          <div className="text-sm font-semibold">Sarah Chen</div>
          <Eyebrow>GreenLeaf Inc.</Eyebrow>
          <ul className="mt-3 space-y-1.5">
            <li className="text-xs flex items-center gap-2"><Check className="size-3 text-accent" /> Email logged · just now</li>
            <li className="text-xs flex items-center gap-2"><Check className="size-3 text-accent" /> Activity timeline updated</li>
            <li className="text-xs flex items-center gap-2"><Clock className="size-3 text-muted-foreground" /> Follow-up suggested · 2 days</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- testimonials ------------------------ */

function Testimonials() {
  const r = useReveal<HTMLDivElement>();
  const items = [
    { q: "I used to spend the first hour of every day typing notes into Salesforce. Now I open Crema, see who to call, and start dialing. The CRM keeps itself.", who: "AE, mid-market SaaS" },
    { q: "The shared memory is the unlock. My replacement onboarded in a week because every conversation I'd ever had was already on the record. No tribal knowledge lost.", who: "Sales lead, dev-tools startup" },
    { q: "The first AI feature in a CRM I actually trust. It tells me what to do and shows me why. No black box, no hallucinated next action.", who: "Head of revenue, fintech" },
  ];
  return (
    <section className="border-t border-border bg-secondary/40">
      <div ref={r.ref} className={`max-w-[1200px] mx-auto px-6 py-24 md:py-32 ${r.className}`}>
        <div className="max-w-3xl">
          <Eyebrow>Testimonials</Eyebrow>
          <h2 className="mt-4 text-4xl md:text-6xl tracking-tight leading-[1.05] font-medium" style={serif}>Reps who got their relationships back.</h2>
        </div>
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
          {items.map((c, i) => (
            <figure key={i} className="rounded-2xl border border-border bg-card p-8 flex flex-col">
              <span className="text-6xl leading-none text-accent" style={serif}>"</span>
              <blockquote className="mt-2 text-base leading-relaxed text-foreground flex-1">{c.q}</blockquote>
              <figcaption className="mt-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{c.who}</figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-10 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Names and companies redacted for the contest build. Real testimonials will replace these post-launch.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------ how it works ---------------------- */

function HowItWorks() {
  const r = useReveal<HTMLDivElement>();
  const steps = [
    { n: "01", t: "Your sites emit", d: "Marketing, product, support, email pixel: anything that can POST JSON." },
    { n: "02", t: "One endpoint", d: "POST /v1/ingest. One auth scheme, one identity graph. No CDP, no Zapier." },
    { n: "03", t: "Identity resolved", d: "anonymous_id → email → customer. Threaded onto the right record automatically." },
    { n: "04", t: "Timeline + Morning Cup", d: "Every signal lands on the record. The rep's morning queue updates live." },
  ];
  return (
    <section id="how" className="border-t border-border">
      <div ref={r.ref} className={`max-w-[1200px] mx-auto px-6 py-24 md:py-32 ${r.className}`}>
        <div className="max-w-3xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-4 text-4xl md:text-6xl tracking-tight leading-[1.05] font-medium" style={serif}>
            How the data finds you, so you don't chase it.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Any property at your company that can speak HTTP can speak to CremaSales. You don't need a CDP or a data team. You need a <span className="font-mono text-foreground bg-secondary px-1.5 py-0.5 rounded">curl</span> and an idea.
          </p>
        </div>
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((s, i) => (
            <div key={i} className="relative rounded-2xl border border-border bg-card p-6">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">{s.n}</span>
              <h4 className="mt-3 text-base font-semibold">{s.t}</h4>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.d}</p>
              {i < steps.length - 1 && (
                <ArrowRight className="hidden lg:block size-4 text-muted-foreground absolute -right-3 top-1/2 -translate-y-1/2 bg-background rounded-full p-0.5 border border-border box-content" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ email capture --------------------- */

function EmailCapture() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Try a real email address.");
      return;
    }
    setSubmitting(true);
    try {
      await subscribeNewsletter({ data: { email } });
      setSent(true);
      setEmail("");
    } catch (err) {
      toast.error("Couldn't subscribe. Try again in a sec.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="border-t border-border bg-secondary/30">
      <div className="max-w-[1200px] mx-auto px-6 py-20 md:py-24 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
        <div>
          <Eyebrow>Stay in the loop</Eyebrow>
          <h2 className="mt-4 text-4xl md:text-5xl tracking-tight leading-[1.05] font-medium" style={serif}>
            Want the long version?
          </h2>
          <p className="mt-4 text-base text-muted-foreground max-w-md">
            Drop your email. We'll send the design diary, the build notes, and an early invite when we open up.
          </p>
        </div>
        <div>
          {sent ? (
            <div className="rounded-2xl border border-accent/40 bg-accent/15 px-6 py-5">
              <p className="text-sm font-medium text-foreground">You're on the list. Pour yourself something while you wait.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                disabled={submitting}
                className="flex-1 h-12 rounded-full bg-card border border-border px-5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={submitting}
                className="h-12 px-6 rounded-full bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-60"
              >
                {submitting ? "Subscribing…" : "Subscribe"}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ demo request ---------------------- */

function DemoRequest() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    title: "",
    phone: "",
    team: "1–10",
    message: "",
  });
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const update = (k: keyof typeof form) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.company) {
      toast.error("Name, email, and company are required.");
      return;
    }
    setSubmitting(true);
    try {
      await requestDemo({
        data: {
          full_name: form.name,
          email: form.email,
          company: form.company,
          title: form.title || undefined,
          phone: form.phone || undefined,
          team_size: form.team || undefined,
          message: form.message || undefined,
        },
      });
      setSent(true);
    } catch (err) {
      toast.error("Couldn't send the request. Try again in a sec.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="demo" className="border-t border-border">
      <div className="max-w-[1200px] mx-auto px-6 py-24 md:py-32 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-14 items-start">
        <div>
          <Eyebrow>Request a demo</Eyebrow>
          <h2 className="mt-4 text-4xl md:text-6xl tracking-tight leading-[1.05] font-medium" style={serif}>
            See it on your own data.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground max-w-md">
            Tell us a bit about your team and we'll get you in a guided session. Two reps, fifteen minutes, no slide deck.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              "Live walk-through with one of the builders",
              "We'll seed a sandbox with your sample data",
              "Yes, you'll appear as a real lead in our CRM. We dogfood.",
            ].map((t, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                <Check className="size-4 text-accent mt-0.5 shrink-0" /> {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-7 shadow-[0_30px_60px_-30px_color-mix(in_oklab,var(--foreground)_20%,transparent)]">
          {sent ? (
            <div className="space-y-4">
              <div className="size-12 rounded-full bg-accent/20 flex items-center justify-center">
                <Check className="size-6 text-accent" />
              </div>
              <h3 className="text-xl font-semibold">You're in.</h3>
              <p className="text-sm text-muted-foreground">
                Check your inbox in a minute, then look for yourself in our CRM. Yes, really. We dogfood.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full name">
                  <input value={form.name} onChange={update("name")} required className={inputCls} placeholder="Jane Doe" />
                </Field>
                <Field label="Title / role">
                  <input value={form.title} onChange={update("title")} className={inputCls} placeholder="Head of Sales" />
                </Field>
              </div>
              <Field label="Work email">
                <input type="email" value={form.email} onChange={update("email")} required className={inputCls} placeholder="jane@company.com" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Company">
                  <input value={form.company} onChange={update("company")} required className={inputCls} placeholder="Acme Corp" />
                </Field>
                <Field label="Phone (optional)">
                  <input type="tel" value={form.phone} onChange={update("phone")} className={inputCls} placeholder="+1 555 123 4567" />
                </Field>
              </div>
              <Field label="Team size">
                <select value={form.team} onChange={update("team")} className={inputCls}>
                  <option>1–10</option>
                  <option>11–50</option>
                  <option>51–200</option>
                  <option>200+</option>
                </select>
              </Field>
              <Field label="What are you trying to solve?">
                <textarea value={form.message} onChange={update("message")} rows={3} className={`${inputCls} resize-none`} placeholder="Our reps spend half the day in the CRM…" />
              </Field>
              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 rounded-full bg-accent text-accent-foreground font-medium hover:bg-accent/90 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting ? "Sending…" : <>Request a demo <ArrowRight className="size-4" /></>}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

const inputCls = "w-full h-11 rounded-lg bg-background border border-border px-3.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

/* -------------------------------- support ------------------------- */

// Lightweight context so the top-bar and footer "Support" links can pop the
// floating ticket widget open. Scoped to the marketing page only.
const SupportCtx = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

function SupportProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <SupportCtx.Provider value={{ open, setOpen }}>{children}</SupportCtx.Provider>;
}

function useSupport() {
  const ctx = useContext(SupportCtx);
  if (!ctx) throw new Error("useSupport must be used inside <SupportProvider>");
  return ctx;
}

// "Support" nav/footer entry — opens the floating widget instead of scrolling.
function SupportNavButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const { setOpen } = useSupport();
  return (
    <button onClick={() => setOpen(true)} className={className}>
      {children}
    </button>
  );
}

// Persisted list of tickets the visitor has opened from this browser. Kept
// only on the client — there's no anonymous account, so localStorage is the
// only continuity we have between sessions. Email-match on the server gates
// what the saved ticket_id can actually do.
const SUPPORT_STORAGE_KEY = "crema_support_tickets_v1";

type StoredTicket = {
  id: string;
  subject: string;
  email: string;
  full_name: string;
  created_at: string;
};

function loadStoredTickets(): StoredTicket[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SUPPORT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is StoredTicket =>
        !!t &&
        typeof t.id === "string" &&
        typeof t.subject === "string" &&
        typeof t.email === "string" &&
        typeof t.full_name === "string" &&
        typeof t.created_at === "string",
    );
  } catch {
    return [];
  }
}

function storeTicket(t: StoredTicket) {
  if (typeof window === "undefined") return;
  const existing = loadStoredTickets();
  const next = [t, ...existing.filter((x) => x.id !== t.id)].slice(0, 50);
  window.localStorage.setItem(SUPPORT_STORAGE_KEY, JSON.stringify(next));
}

function relativeTimeShort(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

type SupportView = "menu" | "form" | "sent" | "detail" | "appended" | "lookup";

// Pull a ticket UUID off the URL (`?ticket=<uuid>`) — used as a cross-device
// deep link from the support ack email. Strips the param after reading so a
// reload doesn't re-trigger the lookup flow.
const TICKET_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function consumeTicketDeepLink(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("ticket");
  if (!raw || !TICKET_UUID_RE.test(raw)) return null;
  params.delete("ticket");
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", next);
  return raw.toLowerCase();
}

// Floating bottom-right launcher + slide-up ticket panel. Anonymous visitors
// get a support ticket form here — no AI chat. After submitting, the ticket
// id is cached in localStorage so they can come back and continue the thread
// inline. Server-side, the email field is matched against the ticket's
// contact before anything is read or written.
function SupportLauncher() {
  const { open, setOpen } = useSupport();
  const [view, setView] = useState<SupportView>("menu");
  const [stored, setStored] = useState<StoredTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deepLinkId, setDeepLinkId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitting, setSubmitting] = useState(false);

  // Deep-link from the support ack email: `/?ticket=<uuid>`. If the ticket is
  // already in this browser's localStorage we jump straight into the thread;
  // otherwise we route into the email-gated lookup view so the visitor can
  // pick it up on a different device.
  useEffect(() => {
    const ticketId = consumeTicketDeepLink();
    if (!ticketId) return;
    const list = loadStoredTickets();
    setStored(list);
    const existing = list.find((t) => t.id === ticketId);
    if (existing) {
      setSelectedId(existing.id);
      setView("detail");
    } else {
      setDeepLinkId(ticketId);
      setView("lookup");
    }
    setOpen(true);
  }, [setOpen]);

  // Resync from storage every time the panel opens; default into the menu
  // when there's history, otherwise straight into the new-ticket form. Skip
  // this when a deep-link already routed us into detail/lookup.
  useEffect(() => {
    if (!open) return;
    if (view === "detail" || view === "lookup") return;
    const list = loadStoredTickets();
    setStored(list);
    setSelectedId(null);
    setView(list.length > 0 ? "menu" : "form");
    // Re-running on `view` would clobber every transition; we only want this
    // to fire when the panel first opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const refreshStored = () => setStored(loadStoredTickets());
  const updateForm = (k: keyof typeof form) => (e: any) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submitNew = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("Try a real email address.");
      return;
    }
    if (!form.subject.trim() || !form.message.trim()) {
      toast.error("Tell us a bit about what's going on.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitSupportTicket({
        data: {
          full_name: form.name.trim(),
          email: form.email.trim(),
          subject: form.subject.trim(),
          message: form.message.trim(),
        },
      });
      if (res?.ticket_id) {
        storeTicket({
          id: res.ticket_id,
          subject: form.subject.trim(),
          email: form.email.trim().toLowerCase(),
          full_name: form.name.trim(),
          created_at: new Date().toISOString(),
        });
        refreshStored();
      }
      setForm({ name: "", email: "", subject: "", message: "" });
      setView("sent");
    } catch (err) {
      toast.error("Couldn't send your request. Try again in a sec.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const selected = stored.find((t) => t.id === selectedId) ?? null;
  const showBack =
    (view === "form" && stored.length > 0) ||
    view === "detail" ||
    view === "appended" ||
    (view === "lookup" && stored.length > 0);

  const headerEyebrow =
    view === "detail" ? "Ticket"
    : view === "menu" ? "Support"
    : view === "sent" || view === "appended" ? "Thanks"
    : view === "lookup" ? "Continue ticket"
    : "Need a hand?";
  const headerTitle =
    view === "detail" && selected ? selected.subject
    : view === "menu" ? "How can we help?"
    : view === "sent" ? "We've got it."
    : view === "appended" ? "Reply sent."
    : view === "lookup" ? "Find your ticket"
    : "Open a support ticket";

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-3rem)] rounded-2xl border border-border bg-card shadow-[0_30px_60px_-20px_color-mix(in_oklab,var(--foreground)_35%,transparent)] overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-border bg-secondary/40">
            <div className="flex items-center gap-2 min-w-0">
              {showBack && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setDeepLinkId(null);
                    setView("menu");
                  }}
                  className="shrink-0 size-7 rounded-full hover:bg-foreground/10 flex items-center justify-center text-muted-foreground"
                  aria-label="Back"
                >
                  <ChevronLeft className="size-4" />
                </button>
              )}
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {headerEyebrow}
                </div>
                <h3 className="mt-1 text-lg font-semibold leading-tight truncate">
                  {headerTitle}
                </h3>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close support"
              className="shrink-0 size-8 rounded-full hover:bg-foreground/10 flex items-center justify-center text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="p-5 max-h-[calc(100vh-12rem)] overflow-y-auto">
            {view === "menu" && (
              <SupportMenu
                stored={stored}
                onNew={() => setView("form")}
                onOpen={(id) => {
                  setSelectedId(id);
                  setView("detail");
                }}
              />
            )}

            {view === "form" && (
              <form onSubmit={submitNew} className="space-y-3.5">
                <p className="text-sm text-muted-foreground">
                  Hit a snag or have a question? A human from Crema reads every one and replies to your email.
                </p>
                <Field label="Your name">
                  <input value={form.name} onChange={updateForm("name")} required className={inputCls} placeholder="Jane Doe" />
                </Field>
                <Field label="Email">
                  <input type="email" value={form.email} onChange={updateForm("email")} required className={inputCls} placeholder="jane@company.com" />
                </Field>
                <Field label="Subject">
                  <input value={form.subject} onChange={updateForm("subject")} required className={inputCls} placeholder="Quick question about…" />
                </Field>
                <Field label="What's going on?">
                  <textarea value={form.message} onChange={updateForm("message")} required rows={4} className={`${inputCls} resize-none h-auto py-3`} placeholder="Tell us what you're trying to do and what's happening instead." />
                </Field>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-11 rounded-full bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {submitting ? "Sending…" : <>Send request <ArrowRight className="size-4" /></>}
                </button>
                <p className="text-[11px] text-muted-foreground text-center">
                  We'll email you a confirmation right away.
                </p>
              </form>
            )}

            {view === "sent" && (
              <SupportSent
                copy="We've opened a ticket and emailed you a confirmation. You can come back here any time to add to it — the conversation lives in this panel."
                onDone={() => {
                  refreshStored();
                  setView("menu");
                }}
              />
            )}

            {view === "detail" && selected && (
              <SupportDetail
                stored={selected}
                onAppended={() => setView("appended")}
              />
            )}

            {view === "lookup" && deepLinkId && (
              <SupportLookup
                ticketId={deepLinkId}
                onFound={(ticket) => {
                  storeTicket(ticket);
                  refreshStored();
                  setSelectedId(ticket.id);
                  setDeepLinkId(null);
                  setView("detail");
                }}
                onCancel={() => {
                  setDeepLinkId(null);
                  const list = loadStoredTickets();
                  setView(list.length > 0 ? "menu" : "form");
                }}
              />
            )}

            {view === "appended" && (
              <SupportSent
                heading="Reply sent."
                copy="We've added your follow-up to the ticket and emailed you a confirmation. The team will pick it up from here."
                onDone={() => {
                  setSelectedId(null);
                  setView("menu");
                }}
              />
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close support" : "Open support"}
        className="group fixed bottom-6 right-6 z-50 size-14 rounded-full flex items-center justify-center shadow-[0_10px_30px_-8px_color-mix(in_oklab,var(--accent)_70%,transparent)] transition-transform hover:-translate-y-0.5 active:scale-95"
        style={{ backgroundImage: "linear-gradient(135deg, #3b2418, #c9885a)" }}
      >
        {open ? <X className="size-6 text-white" /> : <LifeBuoy className="size-6 text-white" />}
      </button>
    </>
  );
}

function SupportMenu({
  stored,
  onNew,
  onOpen,
}: {
  stored: StoredTicket[];
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onNew}
        className="w-full h-12 rounded-xl bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors inline-flex items-center justify-center gap-2"
      >
        <MessageSquarePlus className="size-4" /> Open a new ticket
      </button>
      {stored.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center">
          You haven't opened any tickets from this browser yet.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Your tickets
          </div>
          <ul className="space-y-1.5">
            {stored.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onOpen(t.id)}
                  className="w-full text-left rounded-lg border border-border hover:border-foreground/30 hover:bg-foreground/5 transition-colors px-3 py-2.5"
                >
                  <div className="font-medium text-sm truncate">{t.subject}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                    Opened {relativeTimeShort(t.created_at)} · #{t.id.slice(0, 8)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SupportSent({
  heading = "Got it.",
  copy,
  onDone,
}: {
  heading?: string;
  copy: string;
  onDone: () => void;
}) {
  return (
    <div className="space-y-3 py-2">
      <div className="size-12 rounded-full bg-accent/20 flex items-center justify-center">
        <Check className="size-6 text-accent" />
      </div>
      <h4 className="text-base font-semibold">{heading}</h4>
      <p className="text-sm text-muted-foreground">{copy}</p>
      <button
        onClick={onDone}
        className="mt-1 h-10 px-4 rounded-full bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
      >
        Done
      </button>
    </div>
  );
}

// Cross-device deep-link landing pad. The visitor hit `/?ticket=<uuid>` from
// their support ack email on a browser that doesn't have the ticket cached.
// We collect the email, hand it to `getSupportTicketThread` for the same
// email-match gate the in-panel flow uses, and on success persist a
// StoredTicket so subsequent interactions reuse the regular detail view.
function SupportLookup({
  ticketId,
  onFound,
  onCancel,
}: {
  ticketId: string;
  onFound: (t: StoredTicket) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Try a real email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await getSupportTicketThread({
        data: { ticket_id: ticketId, email: trimmed },
      });
      if (!res.ok) {
        toast.error("That email doesn't match this ticket.");
        return;
      }
      onFound({
        id: res.ticket.id,
        subject: res.ticket.subject.replace(/^Support:\s*/, ""),
        email: trimmed,
        full_name: res.ticket.contact_full_name ?? "",
        created_at: res.ticket.created_at,
      });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't look up that ticket. Try again in a sec.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <p className="text-sm text-muted-foreground">
        Enter the email you used when opening ticket{" "}
        <span className="font-mono">#{ticketId.slice(0, 8)}</span> to read the
        thread and add a reply.
      </p>
      <Field label="Email">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          className={inputCls}
          placeholder="jane@company.com"
        />
      </Field>
      <button
        type="submit"
        disabled={loading}
        className="w-full h-11 rounded-full bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <>Open ticket <ArrowRight className="size-4" /></>}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Cancel
      </button>
    </form>
  );
}

function SupportDetail({
  stored,
  onAppended,
}: {
  stored: StoredTicket;
  onAppended: () => void;
}) {
  type ThreadComment = {
    id: string;
    body: string;
    created_at: string;
    author_id: string | null;
    author_full_name: string | null;
  };
  type Thread = {
    ticket: {
      id: string;
      subject: string;
      status: string;
      priority: string;
      description: string | null;
      created_at: string;
      resolved_at: string | null;
      resolution_note: string | null;
    };
    comments: ThreadComment[];
  };

  const [loading, setLoading] = useState(true);
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setThread(null);
    getSupportTicketThread({
      data: { ticket_id: stored.id, email: stored.email },
    })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setThread(res);
        else setError("We couldn't find this ticket. It may have been deleted.");
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
        setError("Couldn't load this ticket. Try again in a sec.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stored.id, stored.email]);

  const submitFollowUp = async (e: FormEvent) => {
    e.preventDefault();
    const message = followUp.trim();
    if (message.length < 1) {
      toast.error("Type a message first.");
      return;
    }
    setSending(true);
    try {
      const res = await appendSupportTicketMessage({
        data: {
          ticket_id: stored.id,
          email: stored.email,
          full_name: stored.full_name,
          message,
        },
      });
      if (!res.ok) {
        toast.error("We couldn't post your reply. Try again.");
        return;
      }
      setFollowUp("");
      onAppended();
    } catch (err) {
      console.error(err);
      toast.error("Couldn't send your reply. Try again in a sec.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }
  if (error || !thread) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {error ?? "Ticket unavailable."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-2 flex-wrap">
        <span>#{thread.ticket.id.slice(0, 8)}</span>
        <span>·</span>
        <span>Status: {thread.ticket.status}</span>
        <span>·</span>
        <span>Opened {relativeTimeShort(thread.ticket.created_at)}</span>
      </div>

      {thread.ticket.description && (
        <div className="rounded-lg bg-muted/40 border border-border p-3 text-sm whitespace-pre-wrap">
          {thread.ticket.description}
        </div>
      )}

      {thread.comments.length > 0 && (
        <ul className="space-y-2">
          {thread.comments.map((c) => {
            const isCustomer = c.author_id === null;
            return (
              <li
                key={c.id}
                className={`rounded-lg border p-3 text-sm ${
                  isCustomer ? "border-border bg-background" : "border-accent/30 bg-accent/5"
                }`}
              >
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                  {isCustomer ? "You" : c.author_full_name ?? "Crema"}
                  {" · "}
                  {relativeTimeShort(c.created_at)}
                </div>
                <div className="whitespace-pre-wrap">{c.body}</div>
              </li>
            );
          })}
        </ul>
      )}

      {thread.ticket.resolution_note && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
          <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-600 mb-1">
            Resolution
          </div>
          {thread.ticket.resolution_note}
        </div>
      )}

      <form onSubmit={submitFollowUp} className="space-y-2 border-t border-border pt-4">
        <Field label="Add to this ticket">
          <textarea
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            rows={3}
            maxLength={4000}
            required
            className={`${inputCls} resize-none h-auto py-3`}
            placeholder="Anything to add?"
          />
        </Field>
        <button
          type="submit"
          disabled={sending || !followUp.trim()}
          className="w-full h-11 rounded-full bg-foreground text-background font-medium hover:bg-foreground/90 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <>Send reply <ArrowRight className="size-4" /></>}
        </button>
      </form>
    </div>
  );
}

/* ------------------------------ final band ------------------------ */

function FinalBand() {
  return (
    <section className="bg-foreground text-background">
      <div className="max-w-[1200px] mx-auto px-6 py-20 md:py-28 text-center">
        <h2 className="text-4xl md:text-6xl tracking-tight font-medium" style={serif}>
          Show up for your customers. <span className="text-accent">We'll pour the rest.</span>
        </h2>
        <button onClick={() => scrollTo("demo")} className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-7 py-3.5 font-medium hover:bg-accent/90 transition-colors">
          Request a demo <ArrowRight className="size-4" />
        </button>
      </div>
    </section>
  );
}

/* -------------------------------- footer -------------------------- */

function FooterEl() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="max-w-[1200px] mx-auto px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        <div className="col-span-2 md:col-span-1">
          <Wordmark />
          <p className="mt-4 text-xs text-muted-foreground max-w-[220px] italic">
            Crema is the golden, caramel-colored foam on top of a properly pulled espresso shot.
          </p>
        </div>
        <div>
          <Eyebrow>Product</Eyebrow>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            <li><button onClick={() => scrollTo("top")} className="hover:text-foreground">Home</button></li>
            <li><button onClick={() => scrollTo("product")} className="hover:text-foreground">Product</button></li>
            <li><button onClick={() => scrollTo("how")} className="hover:text-foreground">How it works</button></li>
            <li><button onClick={() => scrollTo("extension")} className="hover:text-foreground">Extension</button></li>
            <li><SupportNavButton className="hover:text-foreground">Support</SupportNavButton></li>
          </ul>
        </div>
        <div>
          <Eyebrow>Company</Eyebrow>
          <ul className="mt-3 space-y-2 text-muted-foreground">
            <li><button onClick={() => scrollTo("story")} className="hover:text-foreground">Story</button></li>
            <li><Link to="/investors" className="hover:text-foreground">Investors</Link></li>
            <li><a href="#" className="hover:text-foreground">Privacy</a></li>
            <li><a href="#" className="hover:text-foreground">Terms</a></li>
            <li><Link to="/login" className="hover:text-foreground">Log in</Link></li>
          </ul>
        </div>
        <div>
          <Eyebrow>Pour a shot</Eyebrow>
          <button onClick={() => scrollTo("demo")} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:gap-2 transition-all">
            Request a demo <ArrowRight className="size-4" />
          </button>
          <a
            href="https://github.com/Crema-Sales/"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Open Source <span className="text-border">|</span> MIT Licensed <span className="text-border">|</span> GitHub <Github className="size-3.5 shrink-0" aria-hidden />
          </a>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="max-w-[1200px] mx-auto px-6 py-5">
          <div className="grid grid-cols-3 items-center gap-4">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">© 2026 Crema</span>
            <div className="flex justify-center">
              <MaestroBadge />
            </div>
            <span className="text-xs text-muted-foreground text-right">
              Made with <span className="align-middle">💜</span> in Portland, Oregon
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}