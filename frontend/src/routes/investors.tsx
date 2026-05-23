import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  Quote,
  TrendingUp,
  Coffee,
  Sparkles,
  ShieldCheck,
  Workflow,
  Eye,
  Mail,
  Target,
  Flame,
  Zap,
  Award,
  X,
  Check,
} from "lucide-react";
import { MaestroBadge } from "@/components/maestro-badge";

export const Route = createFileRoute("/investors")({
  head: () => ({
    meta: [
      { title: "Crema: Investor Deck (👋, you found the easter egg)" },
      {
        name: "description",
        content:
          "The CRM that updates itself. Crema is the AI-native sales OS for teams that hate their CRM. Founded by operators who've used every CRM you have.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InvestorsPage,
});

const ACCENT = "#c9885a";
const ACCENT_DARK = "#7a4a2b";
const ACCENT_LIGHT = "#f5e9dc";
const FOAM = "#3b2a1e";

function InvestorsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <PitchHeader />
      <main>
        <Hero />
        <TeamOval />
        <WhyUs />
        <WhyNow />
        <TheProblem />
        <TAM />
        <Competition />
        <Backgrounds />
        <Testimonials />
        <Ask />
        <FinalCta />
      </main>
      <PitchFooter />
    </div>
  );
}

function PitchHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <Coffee className="size-6 shrink-0" style={{ color: ACCENT }} />
          <span className="text-2xl font-bold tracking-tight">
            Crema<span style={{ color: ACCENT }}>.</span>
          </span>
        </Link>
        <div className="flex items-center gap-3 text-xs">
          <span
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono uppercase tracking-widest"
            style={{ backgroundColor: ACCENT_LIGHT, color: ACCENT_DARK }}
          >
            <Coffee className="size-3" />
            Investor pitch · v1.0
          </span>
          <a
            href="mailto:investors@cremasales.com?subject=Crema%20Investor%20chat"
            className="inline-flex items-center px-3.5 py-1.5 rounded-md text-xs font-bold text-background transition-colors"
            style={{ backgroundColor: ACCENT }}
          >
            Let's talk →
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="px-6 pt-24 pb-16 max-w-6xl mx-auto">
      <div className="max-w-3xl flex flex-col gap-y-8">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          The pitch · 2026
        </p>
        <h1
          style={{
            fontFamily: "'Instrument Serif', ui-serif, Georgia, serif",
            fontSize: "clamp(2.75rem, 6vw, 4.5rem)",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            fontWeight: 600,
            marginBottom: "0.5rem",
          }}
        >
          The CRM is the second-most-hated piece of software at every sales org.
        </h1>
        <p
          className="text-muted-foreground"
          style={{
            fontFamily: "'Instrument Serif', ui-serif, Georgia, serif",
            fontSize: "clamp(1.25rem, 2.5vw, 1.75rem)",
            lineHeight: 1.3,
          }}
        >
          We're building the one that updates itself, and the operators are noticing.
        </p>
      </div>
    </section>
  );
}

interface TeamMember {
  name: string;
  initials: string;
  role: string;
  blurb: string;
  src: string;
  linkedin?: string;
  github?: string;
}

const TEAM: TeamMember[] = [
  {
    name: "Pedram Amini",
    initials: "PA",
    role: "Co-founder · CEO · Eng lead",
    blurb:
      "Security researcher, bug-bounty pioneer, ex-Tenable VP/Chief Scientist. Talks at BlackHat, DefCon, RECon. Building Maestro (runmaestro.ai) on the side.",
    src: "/team/pedram.jpg",
    linkedin: "https://www.linkedin.com/in/pedramamini/",
    github: "https://github.com/pedramamini",
  },
  {
    name: "Alex Hessler",
    initials: "AH",
    role: "Co-founder · Product · GTM",
    blurb:
      "Operator who's actually sold the things he's building tools for. Lives in the demo, runs the room, edits the deck at 2am.",
    src: "/team/alex.jpg",
    linkedin: "https://www.linkedin.com/in/alexhessler/",
    github: "https://github.com/alexhessler",
  },
  {
    name: "Jon Irvine",
    initials: "JI",
    role: "Co-founder · Design · Frontend",
    blurb:
      "Built the Lovable-sourced UI you're looking at. Cares about typography, cares more about the rep's morning. Ships pixels that ship deals.",
    src: "/team/jon.jpg",
    linkedin: "https://www.linkedin.com/in/jonirvine/",
    github: "https://github.com/theirmemorial",
  },
];

function TeamOval() {
  return (
    <section className="px-6 py-20 border-y border-border bg-card/40">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            The team
          </p>
          <h2
            className="text-3xl md:text-5xl font-semibold tracking-tight"
            style={{
              fontFamily: "'Instrument Serif', ui-serif, Georgia, serif",
              lineHeight: 1.2,
            }}
          >
            Three operators in a Kiln.
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            We've shipped enterprise SaaS, security research, and B2B SaaS UI. We've also used
            every CRM on the market. This is the one we wish existed.
          </p>
        </div>

        <div className="relative max-w-4xl mx-auto py-8">
          {/* Oval frame */}
          <div
            className="absolute inset-x-12 inset-y-2 rounded-full border-2 border-dashed pointer-events-none"
            style={{ borderColor: `${ACCENT}40` }}
          />
          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 items-center">
            {/* left, lifted */}
            <div className="md:translate-y-6 flex justify-center">
              <TeamCard member={TEAM[1]} />
            </div>
            {/* center, lowered (= oval top arc) */}
            <div className="md:-translate-y-4 flex justify-center">
              <TeamCard member={TEAM[0]} featured />
            </div>
            {/* right, lifted */}
            <div className="md:translate-y-6 flex justify-center">
              <TeamCard member={TEAM[2]} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TeamCard({ member, featured }: { member: TeamMember; featured?: boolean }) {
  const [imgError, setImgError] = useState(false);
  const size = featured ? "size-44 md:size-52" : "size-36 md:size-44";
  return (
    <figure className="flex flex-col items-center gap-3 max-w-[16rem]">
      <div
        className={`${size} rounded-full overflow-hidden relative shadow-lg transition-all`}
        style={{
          backgroundImage: `linear-gradient(135deg, ${ACCENT} 0%, ${FOAM} 100%)`,
          boxShadow: `0 0 0 4px ${ACCENT}40, 0 12px 30px -10px rgba(0,0,0,0.25)`,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-bold tracking-tight text-background"
            style={{
              fontSize: featured ? "3.5rem" : "2.5rem",
              fontFamily: "'Instrument Serif', ui-serif, Georgia, serif",
            }}
          >
            {member.initials}
          </span>
        </div>
        {!imgError && (
          <img
            src={member.src}
            alt={member.name}
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
      </div>
      <figcaption className="text-center space-y-1.5 px-2">
        <p
          className="text-xl md:text-2xl font-semibold tracking-tight"
          style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
        >
          {member.name}
        </p>
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {member.role}
        </p>
        <p className="text-xs text-foreground/70 leading-relaxed">{member.blurb}</p>
        <div className="flex items-center justify-center gap-3 pt-1 text-[10px] font-mono uppercase tracking-widest">
          {member.linkedin ? (
            <a
              href={member.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              linkedin
            </a>
          ) : null}
          {member.github ? (
            <a
              href={member.github}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              github
            </a>
          ) : null}
        </div>
      </figcaption>
    </figure>
  );
}

function WhyUs() {
  const points = [
    {
      icon: <ShieldCheck className="size-5" />,
      title: "We've shipped enterprise SaaS before.",
      body: "Pedram led product at a Nasdaq-listed security platform. We know what regulated buyers actually care about (audit trails, data residency, SSO on day one).",
    },
    {
      icon: <Eye className="size-5" />,
      title: "We use every CRM on the market.",
      body: "Salesforce, HubSpot, Pipedrive, Attio, Folk, Day.ai, Common Room. We've evaluated, deployed, or replaced each one. The pain we're addressing isn't theoretical.",
    },
    {
      icon: <Workflow className="size-5" />,
      title: "We ship in days, not quarters.",
      body: "This entire app (backend, frontend, browser extension, ingest pipeline) went from blank repo to dog-fooded production in under 72 hours of building. We're builders first.",
    },
    {
      icon: <Sparkles className="size-5" />,
      title: "We're already AI-native.",
      body: "We use AI to write the CRM, not just to ship a chatbot inside it. The schema is shaped for agent input. The UI is shaped for agent review. The audit trail is first-class.",
    },
  ];

  return (
    <section className="px-6 py-24 max-w-6xl mx-auto space-y-10">
      <div className="max-w-2xl space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Why us
        </p>
        <h2
          className="text-3xl md:text-5xl font-semibold tracking-tight"
          style={{
            fontFamily: "'Instrument Serif', ui-serif, Georgia, serif",
            lineHeight: 1.2,
          }}
        >
          Builders who've lived the pain.
        </h2>
        <p className="text-muted-foreground max-w-xl leading-relaxed">
          Everyone says they're operator-led. We've actually closed the deals, written the
          quotes, copy-pasted the WhatsApp threads, and rage-quit the dashboards.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {points.map((p) => (
          <article
            key={p.title}
            className="rounded-2xl border border-border bg-card p-6 space-y-3"
          >
            <span
              className="inline-flex items-center justify-center size-10 rounded-lg"
              style={{ backgroundColor: ACCENT_LIGHT, color: ACCENT_DARK }}
            >
              {p.icon}
            </span>
            <h3
              className="text-xl font-semibold tracking-tight"
              style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
            >
              {p.title}
            </h3>
            <p className="text-sm text-foreground/80 leading-relaxed">{p.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function WhyNow() {
  const beats = [
    {
      year: "1999",
      title: "Salesforce ships.",
      body: "The cloud CRM era begins. The object model is designed around reps typing into fields.",
    },
    {
      year: "2014",
      title: "HubSpot IPOs.",
      body: "Marketing-led growth. The freemium CRM. Still: reps typing into fields.",
    },
    {
      year: "2022",
      title: "GPT-3.5 lands.",
      body: "Every incumbent bolts a chatbot onto the existing schema. Reps now have to type AND copy-paste AI answers.",
    },
    {
      year: "2026",
      title: "The agentic backlash.",
      body: "r/salesforce: \"Can we drop this 'agentic' b.s. already?\" pulled 145 upvotes. The opening: an AI-native CRM with the rep, not the dashboard, as the hero.",
    },
  ];
  return (
    <section className="px-6 py-24 border-y border-border bg-card/40">
      <div className="max-w-6xl mx-auto space-y-10">
        <div className="max-w-2xl space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Why now
          </p>
          <h2
            className="text-3xl md:text-5xl font-semibold tracking-tight"
            style={{
              fontFamily: "'Instrument Serif', ui-serif, Georgia, serif",
              lineHeight: 1.2,
            }}
          >
            Three generations of CRM. One opening.
          </h2>
          <p className="text-muted-foreground max-w-xl leading-relaxed">
            The incumbents can't rebuild the schema without breaking their customers. The
            AI-native vendors are still selling "agent in a sidebar." The window to ship a
            ground-up rewrite is open. And short.
          </p>
        </div>
        <ol className="relative space-y-8 border-l border-border pl-6 max-w-3xl">
          {beats.map((b) => (
            <li key={b.year} className="space-y-1.5 relative">
              <div
                className="absolute -left-[1.85rem] size-3 rounded-full mt-1.5"
                style={{ backgroundColor: ACCENT }}
              />
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                {b.year}
              </p>
              <h3
                className="text-xl md:text-2xl font-semibold tracking-tight"
                style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
              >
                {b.title}
              </h3>
              <p className="text-sm text-foreground/80 leading-relaxed">{b.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function TheProblem() {
  const stats = [
    {
      number: "28%",
      label: "of the week reps spend actually selling",
      source: "Salesforce State of Sales",
    },
    {
      number: "68%",
      label: "of reps say CRM data entry is their most time-consuming task",
      source: "industry survey",
    },
    {
      number: "~2%",
      label: "of reps trust the accuracy of CRM data",
      source: "vs 68% who feed it",
    },
    {
      number: "8–10",
      label: "point solutions duct-taped to the CRM at a typical sales org",
      source: "Common Room",
    },
  ];
  return (
    <section className="px-6 py-24 max-w-6xl mx-auto space-y-10">
      <div className="max-w-2xl space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          The problem
        </p>
        <h2
          className="text-3xl md:text-5xl font-semibold tracking-tight"
          style={{
            fontFamily: "'Instrument Serif', ui-serif, Georgia, serif",
            lineHeight: 1.2,
          }}
        >
          The CRM stopped being a sales tool 20 years ago.
        </h2>
        <p className="text-muted-foreground max-w-xl leading-relaxed">
          It became surveillance. Reps know it. The data quality reflects it. Every "AI CRM"
          since GPT has bolted an LLM onto the same broken object model.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-border bg-card p-5 space-y-2"
          >
            <p
              className="text-4xl md:text-5xl font-semibold tracking-tight"
              style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif", color: ACCENT }}
            >
              {s.number}
            </p>
            <p className="text-sm font-semibold leading-snug text-foreground/90">{s.label}</p>
            <p className="text-[11px] text-muted-foreground italic">{s.source}</p>
          </div>
        ))}
      </div>

      <div
        className="rounded-2xl border p-6 md:p-10 space-y-4"
        style={{ borderColor: `${ACCENT}40`, backgroundColor: ACCENT_LIGHT }}
      >
        <Quote className="size-6" style={{ color: ACCENT_DARK }} />
        <blockquote
          className="text-2xl md:text-4xl leading-snug tracking-tight"
          style={{
            fontFamily: "'Instrument Serif', ui-serif, Georgia, serif",
            color: ACCENT_DARK,
          }}
        >
          “Crushed my quota, but got chewed out by my VP for not logging WhatsApp chats
          into Salesforce. Are we closers or data entry monkeys?”
        </blockquote>
        <p
          className="text-xs font-mono"
          style={{ color: ACCENT_DARK }}
        >
          Top r/sales thread of the month · 529 upvotes · 219 comments
        </p>
      </div>
    </section>
  );
}

function TAM() {
  const layers = [
    {
      label: "TAM",
      tag: "Total addressable",
      value: "$96B",
      sub: "global sales tech spend, 2026 (Gartner)",
      ring: 1,
    },
    {
      label: "SAM",
      tag: "Serviceable",
      value: "$24B",
      sub: "SaaS CRM + sales engagement, English-speaking + EU",
      ring: 2,
    },
    {
      label: "SOM",
      tag: "Obtainable, 5 yr",
      value: "$320M",
      sub: "1% of mid-market CRM (10–500 rep teams) at $120/seat/mo",
      ring: 3,
    },
  ];
  return (
    <section className="px-6 py-24 border-y border-border bg-card/40">
      <div className="max-w-6xl mx-auto space-y-10">
        <div className="max-w-2xl space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            TAM
          </p>
          <h2
            className="text-3xl md:text-5xl font-semibold tracking-tight"
            style={{
              fontFamily: "'Instrument Serif', ui-serif, Georgia, serif",
              lineHeight: 1.2,
            }}
          >
            A market large enough to be lazy.
          </h2>
          <p className="text-muted-foreground max-w-xl leading-relaxed">
            Salesforce alone is $35B in ARR. The incumbents are too big to rebuild, too profitable
            to want to. A single percent of the mid-market is a generational outcome.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {layers.map((l) => (
            <article
              key={l.label}
              className="rounded-2xl border bg-background p-6 space-y-2 relative overflow-hidden"
              style={{ borderColor: `${ACCENT}${l.ring === 1 ? "30" : l.ring === 2 ? "60" : "90"}` }}
            >
              <div
                className="absolute -right-8 -top-8 size-32 rounded-full opacity-10"
                style={{ backgroundColor: ACCENT }}
              />
              <p
                className="text-[10px] font-mono uppercase tracking-widest"
                style={{ color: ACCENT_DARK }}
              >
                {l.label} · {l.tag}
              </p>
              <p
                className="text-5xl md:text-6xl font-semibold tracking-tight"
                style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
              >
                {l.value}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">{l.sub}</p>
            </article>
          ))}
        </div>

        <p className="text-xs text-muted-foreground italic max-w-3xl">
          Sources: Gartner (sales tech market sizing, 2026), Salesforce 10-K (FY26 revenue),
          HubSpot 10-K (mid-market segmentation). Numbers rounded, deck-sized. Happy to walk
          through the full bottoms-up model.
        </p>
      </div>
    </section>
  );
}

interface Competitor {
  name: string;
  positioning: string;
  strength: string;
  weakness: string;
  vsUs: string;
}

const COMPETITORS: Competitor[] = [
  {
    name: "Salesforce",
    positioning: "Old guard. Enterprise default.",
    strength: "Distribution, brand, marketplace, every Fortune 500.",
    weakness: "1999 object model. Page loads measured in seconds. Six SKUs per feature.",
    vsUs:
      "We're 10× lighter and 100× faster. They can't rebuild the schema without churning the install base.",
  },
  {
    name: "HubSpot",
    positioning: "Old guard. SMB default.",
    strength: "Generous free tier, 2000-app marketplace, marketing-led brand.",
    weakness: "Same input-device assumption. AI bolted on. Mobile app is famously second-class.",
    vsUs: "We treat AI as the default writer; HubSpot still treats the rep as the typist.",
  },
  {
    name: "Pipedrive / Attio",
    positioning: "New(er) guard. Rep-first UI.",
    strength: "Beautiful pipelines, sub-second loads, ⌘K palettes, design-led.",
    weakness: "No cross-property ingest story. Still requires manual data entry at scale.",
    vsUs: "Same design polish, plus the auto-capture and copilot they don't have.",
  },
  {
    name: "Day.ai / Clarify / Common Room",
    positioning: "AI-native CRM contenders.",
    strength: "Shared memory, signal aggregation, modern stacks.",
    weakness: "Single-channel ingest. Black-box ranking. No browser-side copilot.",
    vsUs:
      "Same thesis, but with transparent ranking (\"why is this row #1?\"), one /v1/ingest endpoint, and an in-browser copilot that shares the rep's view.",
  },
];

function Competition() {
  return (
    <section className="px-6 py-24 max-w-6xl mx-auto space-y-10">
      <div className="max-w-2xl space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Competition
        </p>
        <h2
          className="text-3xl md:text-5xl font-semibold tracking-tight"
          style={{
            fontFamily: "'Instrument Serif', ui-serif, Georgia, serif",
            lineHeight: 1.2,
          }}
        >
          Old guard can't pivot. New guard didn't go deep enough.
        </h2>
        <p className="text-muted-foreground max-w-xl leading-relaxed">
          Everyone in the category fits one of two patterns. We're the third.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {COMPETITORS.map((c) => (
          <article
            key={c.name}
            className="rounded-2xl border border-border bg-card p-6 space-y-4"
          >
            <header className="space-y-1">
              <h3
                className="text-2xl font-semibold tracking-tight"
                style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
              >
                {c.name}
              </h3>
              <p
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: ACCENT_DARK }}
              >
                {c.positioning}
              </p>
            </header>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Check className="size-4 shrink-0 mt-0.5 text-green-600" />
                <p className="text-foreground/80 leading-relaxed">
                  <span className="font-semibold">Strength:</span> {c.strength}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <X className="size-4 shrink-0 mt-0.5 text-rose-600" />
                <p className="text-foreground/80 leading-relaxed">
                  <span className="font-semibold">Weakness:</span> {c.weakness}
                </p>
              </div>
              <div
                className="flex items-start gap-2 rounded-lg p-3"
                style={{ backgroundColor: ACCENT_LIGHT }}
              >
                <Coffee className="size-4 shrink-0 mt-0.5" style={{ color: ACCENT_DARK }} />
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: ACCENT_DARK }}
                >
                  <span className="font-bold">Crema vs. {c.name}:</span> {c.vsUs}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Backgrounds() {
  const lines = [
    {
      who: "Pedram",
      bullets: [
        "Co-founder, ex-VP/Chief Scientist at a Nasdaq-listed security platform.",
        "Bug-bounty pioneer; speaker at BlackHat, DefCon, RECon, Ekoparty, ShmooCon.",
        "Building Maestro (runmaestro.ai), a multi-agent orchestrator already in real use.",
        "Tulane CS · Austin, TX · 14k+ followers across LinkedIn/X.",
      ],
    },
    {
      who: "Alex",
      bullets: [
        "Operator background: has actually carried a bag and missed quota and crushed quota.",
        "Owns product, GTM, and the demo room. Edits the deck the morning of the pitch.",
        "Lives in the customer interview, exits with a roadmap, not a follow-up email.",
      ],
    },
    {
      who: "Jon",
      bullets: [
        "Design + frontend. Ships the Lovable-sourced React on top of the Workers/D1 backend.",
        "Type-obsessed (Instrument Serif, JetBrains Mono, this entire deck basically).",
        "Believes the rep's morning is the product surface that matters.",
      ],
    },
  ];
  return (
    <section className="px-6 py-24 border-y border-border bg-card/40">
      <div className="max-w-6xl mx-auto space-y-10">
        <div className="max-w-2xl space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Backgrounds
          </p>
          <h2
            className="text-3xl md:text-5xl font-semibold tracking-tight"
            style={{
              fontFamily: "'Instrument Serif', ui-serif, Georgia, serif",
              lineHeight: 1.2,
            }}
          >
            What each of us actually brings.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {lines.map((l) => (
            <article
              key={l.who}
              className="rounded-2xl border border-border bg-background p-6 space-y-4"
            >
              <h3
                className="text-2xl font-semibold tracking-tight"
                style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
              >
                {l.who}
              </h3>
              <ul className="space-y-2 text-sm leading-relaxed text-foreground/80">
                {l.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span
                      className="mt-1.5 size-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: ACCENT }}
                    />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

interface Reddit {
  quote: string;
  handle: string;
  venue: string;
  upvotes: number;
}

const REDDIT_TESTIMONIALS: Reddit[] = [
  {
    quote:
      "You realize you're working for the dashboard not the deal.",
    handle: "u/450touchpoints_no",
    venue: "r/sales",
    upvotes: 110,
  },
  {
    quote:
      "If it isn't in Salesforce, it didn't happen. Fill out notes in Salesforce gives power to the company, which is why managers care so much.",
    handle: "u/tribal_knowledge",
    venue: "r/sales · top comment",
    upvotes: 412,
  },
  {
    quote:
      "My clients don't use corporate email anymore. They text me on WhatsApp, on iMessage, sometimes Facebook. Apparently I didn't spend 2 hours a day manually copy-pasting every text into 40 required drop-downs.",
    handle: "u/whatsapp_AE",
    venue: "r/sales",
    upvotes: 387,
  },
  {
    quote:
      "I think my company's new AI-powered CRM is less about helping sales and more about learning how to replace us.",
    handle: "u/training_my_replacement",
    venue: "r/sales · thread title",
    upvotes: 89,
  },
  {
    quote:
      "Can we drop this 'agentic' b.s. already?! We've introduced a probabilistic layer into what used to be a deterministic process. For… Campaign Member Statuses.",
    handle: "u/no_more_agentic",
    venue: "r/salesforce",
    upvotes: 145,
  },
  {
    quote:
      "Functionality that used to work with Einstein 1 no longer works and is hidden behind Agentforce 1 at a further price increase.",
    handle: "u/headless_in_2026",
    venue: "r/salesforce · 'Open Letter' thread",
    upvotes: 175,
  },
];

function Testimonials() {
  return (
    <section className="px-6 py-24 max-w-6xl mx-auto space-y-10">
      <div className="max-w-2xl space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Voice of customer
        </p>
        <h2
          className="text-3xl md:text-5xl font-semibold tracking-tight"
          style={{
            fontFamily: "'Instrument Serif', ui-serif, Georgia, serif",
            lineHeight: 1.2,
          }}
        >
          The reps wrote our pitch deck for us.
        </h2>
        <p className="text-muted-foreground max-w-xl leading-relaxed">
          Pulled verbatim from r/sales, r/salesforce, and r/CRM in May 2026. Handles
          anonymized; upvote counts are real.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REDDIT_TESTIMONIALS.map((t) => (
          <figure
            key={t.handle}
            className="rounded-2xl border border-border bg-card p-6 space-y-4 flex flex-col"
          >
            <Quote className="size-5" style={{ color: ACCENT }} />
            <blockquote className="text-sm md:text-base leading-relaxed text-foreground/90 flex-1">
              “{t.quote}”
            </blockquote>
            <figcaption className="space-y-1.5 pt-3 border-t border-border/60">
              <p className="text-xs font-mono font-semibold text-foreground/80">{t.handle}</p>
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">{t.venue}</p>
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold"
                  style={{ backgroundColor: ACCENT_LIGHT, color: ACCENT_DARK }}
                >
                  <TrendingUp className="size-3" />
                  {t.upvotes}
                </span>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function Ask() {
  const uses = [
    {
      icon: <Zap className="size-5" />,
      label: "55% engineering",
      body: "Three senior engineers (one DO/Workers, one schema/ingest, one extension). Ship native WhatsApp/email capture by Q2.",
    },
    {
      icon: <Target className="size-5" />,
      label: "25% GTM",
      body: "Two-rep design-partner team. Pay 10 design partners to use Crema as their actual CRM for 6 months. Drive case studies, not logos.",
    },
    {
      icon: <Flame className="size-5" />,
      label: "10% infra",
      body: "Cloudflare Workers + D1 at our scale targets, plus per-tenant isolation and SOC2 prep work.",
    },
    {
      icon: <Award className="size-5" />,
      label: "10% runway buffer",
      body: "18 months of runway floor so we can be patient with design-partner conversions instead of forcing logos.",
    },
  ];
  return (
    <section className="px-6 py-24 border-y border-border bg-card/40">
      <div className="max-w-6xl mx-auto space-y-10">
        <div className="max-w-2xl space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            The ask · use of funds
          </p>
          <h2
            className="text-3xl md:text-5xl font-semibold tracking-tight"
            style={{
              fontFamily: "'Instrument Serif', ui-serif, Georgia, serif",
              lineHeight: 1.2,
            }}
          >
            Raising a $3.5M seed.
          </h2>
          <p className="text-muted-foreground max-w-xl leading-relaxed">
            18 months of runway to ship native channels (WhatsApp, email, calendar), prove the
            auto-capture story with 10 paid design partners, and reach a Series A milestone of
            $750k ARR.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {uses.map((u) => (
            <article
              key={u.label}
              className="rounded-2xl border border-border bg-background p-6 space-y-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex items-center justify-center size-10 rounded-lg"
                  style={{ backgroundColor: ACCENT_LIGHT, color: ACCENT_DARK }}
                >
                  {u.icon}
                </span>
                <p
                  className="text-xl font-semibold tracking-tight"
                  style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
                >
                  {u.label}
                </p>
              </div>
              <p className="text-sm leading-relaxed text-foreground/80">{u.body}</p>
            </article>
          ))}
        </div>

        <div
          className="rounded-2xl p-6 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6 items-center"
          style={{ backgroundColor: FOAM, color: "#f5e9dc" }}
        >
          <div className="md:col-span-2 space-y-1">
            <p
              className="text-[10px] font-bold uppercase tracking-widest opacity-70"
              style={{ color: ACCENT }}
            >
              Milestones the round buys
            </p>
            <p
              className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight"
              style={{ fontFamily: "'Instrument Serif', ui-serif, Georgia, serif" }}
            >
              10 paying design partners · $750k ARR · native ingest for the 3 channels reps
              actually use.
            </p>
          </div>
          <a
            href="mailto:investors@cremasales.com?subject=Crema%20Investor%20chat"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-bold transition-colors w-full"
            style={{ backgroundColor: ACCENT, color: FOAM }}
          >
            Wire instructions <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-6 py-24 max-w-4xl mx-auto text-center space-y-6">
      <Coffee className="size-10 mx-auto" style={{ color: ACCENT }} />
      <h2
        className="text-4xl md:text-6xl font-semibold tracking-tight"
        style={{
          fontFamily: "'Instrument Serif', ui-serif, Georgia, serif",
          lineHeight: 1.15,
        }}
      >
        Coffee is for closers.
      </h2>
      <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
        Crema is the foam on top of a properly pulled espresso shot. It's the part you don't
        have to engineer. It's a sign that everything underneath worked. That's the CRM we're
        building.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <a
          href="mailto:investors@cremasales.com?subject=Crema%20Investor%20chat"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-bold text-background transition-colors"
          style={{ backgroundColor: ACCENT }}
        >
          <Mail className="size-4" />
          investors@cremasales.com
        </a>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-3 border border-border rounded-lg text-sm font-bold hover:bg-muted/40 transition-colors"
        >
          See the product →
        </Link>
      </div>
    </section>
  );
}

function PitchFooter() {
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-4">
        <div className="text-[11px] text-muted-foreground flex flex-wrap items-center justify-between gap-2 font-mono uppercase tracking-widest">
          <span>© 2026 CremaSales · investor deck v1.0</span>
          <span>You found the easter egg ·{" "}
            <a
              href="https://cremasales.com"
              className="underline-offset-2 hover:underline"
            >
              cremasales.com
            </a>
          </span>
        </div>
        <div className="flex justify-center">
          <MaestroBadge />
        </div>
      </div>
    </footer>
  );
}
