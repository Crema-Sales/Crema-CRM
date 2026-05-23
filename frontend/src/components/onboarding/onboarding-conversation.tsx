import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Coffee, Send } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MessageBody } from "@/components/assistant/message-body";
import { streamAgentReply, type AgentChatHistoryEntry } from "@/lib/agent-stream";
import { getAgentToken } from "@/lib/agent-token-fns";
import { getMe, updateProfile, USER_SYSTEM_PROMPT_MAX } from "@/lib/crm.functions";
import {
  COACH_PERSONAS_BY_SLUG,
  SALES_CONTEXT_LABEL,
  type CoachPersona,
} from "@/lib/coach-personas";
import { setMyCoachPersona } from "@/auth/coach-persona-fns";
import { CoachPickerDialog } from "@/components/coach-picker";
import { useTour } from "@/components/tour/tour-context";
import {
  hasSeenCoachOnboarding,
  hasSeenIntroConversation,
  markIntroConversationSeen,
} from "@/lib/onboarding-flags";

// The conversational onboarding overlay. It bridges the coach picker and the
// app: a focused centered modal where the chosen coach introduces itself,
// either gathering a working-style profile (first-timers) or greeting a
// returning rep, then floats to the bottom-right corner and offers the tour.
//
// The coach's replies are real, streamed from the same RepAgent the bubble
// uses — it already reads the coach persona from the JWT. The flow control
// (turn cap, transition, dock) is owned here so the experience is
// deterministic regardless of what the model says.

type Mode = "questions" | "greeting";
type Phase = "inactive" | "loading" | "chat" | "docked" | "closed";
type Msg = { id: string; role: "user" | "assistant"; content: string };

const MAX_QUESTION_TURNS = 3;

// --- agent priming -------------------------------------------------------
// These ride as the `prompt` of an otherwise-invisible turn: the rep never
// sees them, only the coach's reply. Bracketed so a model that echoes its
// instructions still reads as stage direction, not chat.

const OPENER_QUESTIONS =
  "[Crema onboarding. The rep just created their account and this is the very " +
  "first thing you say to them. Speak in your own coach voice. In one short, " +
  "warm paragraph: introduce yourself in a sentence, then ask them — as a single " +
  "friendly question — who they are and what you should call them, a little about " +
  "them and their business, and what they're hoping you can help with. No lists, " +
  "no markdown headings. Do not call any tools.]";

const OPENER_GREETING =
  "[Crema onboarding. Welcome the rep back — you already know how they like to " +
  "work, so do not ask onboarding questions. In your coach voice, greet them " +
  "warmly (use their name if you know it), then tell them what's on their plate " +
  "today: call prioritizedActions and mention the top one or two items in a " +
  "sentence or two. Keep it to one short, warm paragraph.]";

const EXTRACTION_PROMPT =
  "[Internal instruction — do not address the rep, this output is never shown to " +
  "them. Output ONLY their working-style profile and nothing else. First line " +
  "exactly: NAME: <what they want to be called, or leave blank if unknown>. Then " +
  '2 to 4 plain first-person sentences ("I ...") capturing who they are, what ' +
  "their business is, and how they like a copilot to work with them. No greeting, " +
  "no markdown, no preamble, no quotes.]";

const TRANSITION_PROMPT =
  "[Crema onboarding — wrap up. In your coach voice, one short warm paragraph: " +
  "tell the rep it was good to meet them and you've got what you need, let them " +
  "know you're always one click away in the bottom-right corner whenever they " +
  "want you, and offer to give them a quick tour of the app. No lists.]";

// Scripted fallbacks — used when the agent token is missing or the stream
// fails, so the flow never dead-ends on a blank bubble.
const FB_OPENER_Q =
  "Hey — welcome to Crema. I'm in your corner from here on out. Before we dive " +
  "in: who am I talking to, and what should I call you? Tell me a bit about you, " +
  "your business, and what you're hoping I can help with.";
const FB_OPENER_G = "Welcome back — good to see you. Let's get into your day.";
const FB_ACK = "Got it — thanks for sharing that.";
const FB_TRANSITION =
  "Love it — that's everything I need. I'll always be right here in the " +
  "bottom-right corner whenever you want me. Want a quick tour of the place first?";

const rid = () => crypto.randomUUID();

/** Splits the extraction reply into a preferred name + the profile prose. */
function parseProfile(raw: string): { name: string | null; prompt: string } {
  const text = raw.trim();
  if (!text) return { name: null, prompt: "" };
  const lines = text.split(/\r?\n/);
  if (lines[0] && /^name:/i.test(lines[0].trim())) {
    const n = lines[0]
      .trim()
      .replace(/^name:/i, "")
      .trim();
    const name = n.length > 0 && n.length <= 80 ? n : null;
    return { name, prompt: lines.slice(1).join("\n").trim() };
  }
  return { name: null, prompt: text };
}

export function OnboardingConversation({
  userId,
  coachSlug,
}: {
  userId: string;
  coachSlug: string | null;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { startTour, dismissWelcomePrompt } = useTour();

  const getTokenFn = useServerFn(getAgentToken);
  const getMeFn = useServerFn(getMe);
  const updateProfileFn = useServerFn(updateProfile);
  const setCoachFn = useServerFn(setMyCoachPersona);

  const [phase, setPhase] = useState<Phase>("inactive");
  const [mode, setMode] = useState<Mode>("questions");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSaving, setPickerSaving] = useState(false);
  // Local override of the slug coming in from the session — lets us swap the
  // coach mid-flow without waiting for a route reload to re-read the cookie.
  const [localSlug, setLocalSlug] = useState<string | null>(coachSlug);

  const tokenRef = useRef<string | null>(null);
  const historyRef = useRef<AgentChatHistoryEntry[]>([]);
  const userTurnsRef = useRef(0);
  const startedRef = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const effectiveSlug = localSlug ?? coachSlug;
  const coach = effectiveSlug ? (COACH_PERSONAS_BY_SLUG[effectiveSlug] ?? null) : null;
  const coachName = coach?.name ?? "Crema";

  // Stream one agent turn. `display` controls whether the rep sees the reply
  // (the extraction turn is hidden); `fallback` is used if there's no token
  // or the socket fails. Always records the turn into the agent history.
  const streamTurn = useCallback(
    async (prompt: string, display: boolean, fallback: string): Promise<string> => {
      const token = tokenRef.current;
      const history = [...historyRef.current];
      const asstId = rid();
      if (display) {
        setMessages((m) => [...m, { id: asstId, role: "assistant", content: "" }]);
      }
      setStreaming(true);
      let text = "";
      try {
        if (!token) throw new Error("no-agent-token");
        text = await streamAgentReply({
          token,
          prompt,
          history,
          onTextDelta: (chunk) => {
            if (!display) return;
            setMessages((m) =>
              m.map((x) => (x.id === asstId ? { ...x, content: x.content + chunk } : x)),
            );
          },
        });
        if (!text.trim()) text = fallback;
      } catch (err) {
        console.error("[onboarding] agent turn failed", err);
        text = fallback;
      } finally {
        setStreaming(false);
      }
      if (display) {
        setMessages((m) => m.map((x) => (x.id === asstId ? { ...x, content: text } : x)));
      }
      historyRef.current = [
        ...history,
        { id: rid(), role: "user", content: prompt },
        { id: asstId, role: "assistant", content: text },
      ];
      return text;
    },
    [],
  );

  // Questions path only: distill the rep's answers into a profile and save it
  // to their settings, then say goodbye and dock.
  const wrapUpQuestions = useCallback(
    async (lastUserText: string) => {
      // The rep's final answer hasn't been sent to the agent yet — record it
      // so the extraction turn can see it.
      historyRef.current = [
        ...historyRef.current,
        { id: rid(), role: "user", content: lastUserText },
      ];
      const snapshot = [...historyRef.current];
      const profileText = await streamTurn(EXTRACTION_PROMPT, false, "");
      // Drop the internal extraction turn so it never leaks into the
      // transition turn's context.
      historyRef.current = snapshot;

      const { name, prompt } = parseProfile(profileText);
      if (prompt) {
        try {
          await updateProfileFn({
            data: {
              system_prompt: prompt.slice(0, USER_SYSTEM_PROMPT_MAX),
              ...(name ? { full_name: name } : {}),
            },
          });
        } catch (err) {
          console.error("[onboarding] failed to save profile", err);
        }
      }

      await streamTurn(TRANSITION_PROMPT, true, FB_TRANSITION);
      markIntroConversationSeen(userId);
      setPhase("docked");
    },
    [streamTurn, updateProfileFn, userId],
  );

  // Greeting path: nothing to gather — just say goodbye and dock.
  const proceedFromGreeting = useCallback(async () => {
    if (streaming) return;
    await streamTurn(TRANSITION_PROMPT, true, FB_TRANSITION);
    markIntroConversationSeen(userId);
    setPhase("docked");
  }, [streaming, streamTurn, userId]);

  const handleSend = useCallback(
    async (raw: string) => {
      if (streaming) return;
      const clean = raw.trim();
      if (!clean) return;
      setMessages((m) => [...m, { id: rid(), role: "user", content: clean }]);
      const turns = userTurnsRef.current + 1;
      userTurnsRef.current = turns;
      if (mode === "questions" && turns >= MAX_QUESTION_TURNS) {
        await wrapUpQuestions(clean);
      } else {
        await streamTurn(clean, true, FB_ACK);
      }
    },
    [streaming, mode, streamTurn, wrapUpQuestions],
  );

  // Boot the flow: fetch the agent token + profile, branch on whether the
  // rep already has a working-style prompt, then fire the opener.
  const begin = useCallback(async () => {
    setPhase("loading");
    let token: string | null = null;
    let existing = "";
    try {
      const [tok, me] = await Promise.all([getTokenFn(), getMeFn()]);
      token = tok?.token ?? null;
      existing = (me?.profile?.system_prompt ?? "").trim();
    } catch (err) {
      console.error("[onboarding] failed to load session for intro", err);
    }
    tokenRef.current = token;
    const nextMode: Mode = existing.length > 0 ? "greeting" : "questions";
    setMode(nextMode);
    setPhase("chat");
    await streamTurn(
      nextMode === "greeting" ? OPENER_GREETING : OPENER_QUESTIONS,
      true,
      nextMode === "greeting" ? FB_OPENER_G : FB_OPENER_Q,
    );
  }, [getTokenFn, getMeFn, streamTurn]);

  // Trigger once, when the rep lands on /today straight after the coach
  // picker and hasn't already seen the intro on this browser.
  useEffect(() => {
    if (phase !== "inactive" || startedRef.current) return;
    if (pathname !== "/today") return;
    if (hasSeenIntroConversation(userId)) return;
    if (!hasSeenCoachOnboarding(userId)) return;
    startedRef.current = true;
    void begin();
  }, [phase, pathname, userId, begin]);

  // Keep the latest message in view as the thread grows / streams.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, phase]);

  // Swap coaches mid-flow: persist the new slug, refresh the JWT-backed agent
  // token so the next streamed turn carries the new voice, reset the
  // conversation, and replay the opener as the new coach.
  const handlePickCoach = useCallback(
    async (slug: string) => {
      if (streaming || pickerSaving) return;
      setPickerSaving(true);
      try {
        await setCoachFn({ data: { slug } });
        let token: string | null = null;
        let existing = "";
        try {
          const [tok, me] = await Promise.all([getTokenFn(), getMeFn()]);
          token = tok?.token ?? null;
          existing = (me?.profile?.system_prompt ?? "").trim();
        } catch (err) {
          console.error("[onboarding] failed to refresh session after coach swap", err);
        }
        tokenRef.current = token;
        historyRef.current = [];
        userTurnsRef.current = 0;
        setMessages([]);
        setLocalSlug(slug);
        setPickerOpen(false);
        setFlipped(false);
        const nextMode: Mode = existing.length > 0 ? "greeting" : "questions";
        setMode(nextMode);
        setPhase("chat");
        await streamTurn(
          nextMode === "greeting" ? OPENER_GREETING : OPENER_QUESTIONS,
          true,
          nextMode === "greeting" ? FB_OPENER_G : FB_OPENER_Q,
        );
      } catch (err) {
        console.error("[onboarding] failed to change coach", err);
        toast.error(err instanceof Error ? err.message : "Failed to change coach");
      } finally {
        setPickerSaving(false);
      }
    },
    [streaming, pickerSaving, setCoachFn, getTokenFn, getMeFn, streamTurn],
  );

  const takeTour = useCallback(() => {
    setPhase("closed");
    startTour();
  }, [startTour]);

  const skipTour = useCallback(() => {
    setPhase("closed");
    // Mark the tour skipped so the standalone welcome prompt never nags later.
    dismissWelcomePrompt();
  }, [dismissWelcomePrompt]);

  if (phase === "inactive" || phase === "closed") return null;

  const docked = phase === "docked";
  const showTyping =
    streaming && (messages.length === 0 || messages[messages.length - 1].content.length === 0);

  return (
    <>
      <AnimatePresence>
        {!docked && (
          <motion.div
            key="onboarding-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[80] bg-foreground/30 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      <div
        className={cn(
          "fixed inset-0 z-[80] flex",
          docked
            ? "items-end justify-end p-6 pointer-events-none"
            : "items-center justify-center p-4",
        )}
      >
        <AnimatePresence>
          <motion.div
            key="onboarding-panel"
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ layout: { type: "spring", stiffness: 240, damping: 28 }, duration: 0.2 }}
            className={cn(
              "pointer-events-auto relative",
              docked
                ? "w-[380px] h-[500px] max-h-[calc(100vh-3rem)]"
                : "w-[760px] h-[600px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]",
            )}
            style={{ perspective: "1400px" }}
          >
            <div
              className="relative h-full w-full transition-transform duration-700"
              style={{
                transformStyle: "preserve-3d",
                transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
              }}
            >
              {/* FRONT */}
              <div
                className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
                style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
                aria-hidden={flipped}
              >
                <CoachHeader
                  coach={coach}
                  coachName={coachName}
                  subtitle={docked ? "your copilot" : "getting you set up"}
                  onFlip={() => setFlipped(true)}
                  flipped={false}
                />

                {/* messages */}
                <div className="flex-1 min-h-0 space-y-3 overflow-y-auto px-4 py-3">
                  {messages.map((m) =>
                    m.role === "assistant" ? (
                      <div key={m.id} className="flex gap-2">
                        <CoachAvatar coach={coach} size="sm" />
                        <div className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed">
                          {m.content ? <MessageBody text={m.content} /> : <TypingDots />}
                        </div>
                      </div>
                    ) : (
                      <div key={m.id} className="flex justify-end">
                        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-foreground px-3 py-2 text-sm text-background">
                          {m.content}
                        </div>
                      </div>
                    ),
                  )}
                  {messages.length === 0 && (showTyping || phase === "loading") && (
                    <div className="flex gap-2">
                      <CoachAvatar coach={coach} size="sm" />
                      <TypingDots />
                    </div>
                  )}
                  <div ref={endRef} />
                </div>

                {/* footer */}
                {docked ? (
                  <div className="shrink-0 space-y-2 border-t border-border p-3">
                    <button
                      type="button"
                      onClick={takeTour}
                      className="h-9 w-full rounded-lg bg-foreground text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
                    >
                      Take the quick tour
                    </button>
                    <button
                      type="button"
                      onClick={skipTour}
                      className="w-full text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Maybe later
                    </button>
                  </div>
                ) : phase === "chat" ? (
                  <div className="shrink-0 border-t border-border">
                    {mode === "greeting" && (
                      <button
                        type="button"
                        onClick={() => void proceedFromGreeting()}
                        disabled={streaming}
                        className="w-full border-b border-border bg-secondary/30 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/60 disabled:opacity-50"
                      >
                        Sounds good — show me around →
                      </button>
                    )}
                    <Composer disabled={streaming} onSend={(t) => void handleSend(t)} />
                  </div>
                ) : null}
              </div>

              {/* BACK */}
              <div
                className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
                style={{
                  backfaceVisibility: "hidden",
                  WebkitBackfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
                aria-hidden={!flipped}
              >
                <CoachHeader
                  coach={coach}
                  coachName={coachName}
                  subtitle="about your coach"
                  onFlip={() => setFlipped(false)}
                  flipped
                />
                <CoachBack coach={coach} />
                <div className="shrink-0 border-t border-border p-3">
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    disabled={pickerSaving || streaming}
                    className="h-9 w-full rounded-lg bg-foreground text-sm font-semibold text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
                  >
                    {pickerSaving ? "Switching…" : "Change coach"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <CoachPickerDialog
        open={pickerOpen}
        onOpenChange={(o) => {
          if (!pickerSaving) setPickerOpen(o);
        }}
        currentSlug={effectiveSlug}
        saving={pickerSaving}
        onPick={(slug) => void handlePickCoach(slug)}
      />
    </>
  );
}

function CoachHeader({
  coach,
  coachName,
  subtitle,
  onFlip,
  flipped,
}: {
  coach: CoachPersona | null;
  coachName: string;
  subtitle: string;
  onFlip: () => void;
  flipped: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onFlip}
      aria-label={flipped ? "Back to chat" : "About your coach"}
      title={flipped ? "Back to chat" : "About your coach"}
      className="flex shrink-0 items-center gap-3 border-b border-border bg-secondary/40 px-4 py-3 text-left transition-colors hover:bg-secondary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
    >
      <CoachAvatar coach={coach} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{coachName}</div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {subtitle}
        </div>
      </div>
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {flipped ? "back ←" : "info →"}
      </span>
    </button>
  );
}

function CoachBack({ coach }: { coach: CoachPersona | null }) {
  if (!coach) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center px-6 py-8 text-center text-sm text-muted-foreground">
        No coach picked yet — tap “Change coach” below to choose one.
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {coach.archetype} · Energy {coach.energy}/10 · {coach.energyDescriptor}
        </p>
        <p className="mt-1 text-sm italic text-foreground">“{coach.tagline}”</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {coach.salesContexts.map((c) => (
            <span
              key={c}
              className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-foreground"
            >
              {SALES_CONTEXT_LABEL[c]}
            </span>
          ))}
        </div>
      </div>

      <p className="text-sm leading-relaxed text-foreground">{coach.hook}</p>

      <BackSection title="Signature moves">
        <ul className="space-y-1.5">
          {coach.signatureTechniques.slice(0, 4).map((t) => (
            <li key={t.name} className="text-xs leading-relaxed">
              <span className="font-semibold">{t.name}</span>
              <span className="text-muted-foreground"> — {t.description}</span>
            </li>
          ))}
        </ul>
      </BackSection>

      <BackSection title="Catchphrases">
        <ul className="space-y-1">
          {coach.catchphrases.slice(0, 4).map((q, i) => (
            <li key={i} className="text-xs italic text-muted-foreground">
              “{q}”
            </li>
          ))}
        </ul>
      </BackSection>
    </div>
  );
}

function BackSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function CoachAvatar({
  coach,
  size,
}: {
  coach: { name: string; headshotPath: string } | null;
  size: "sm" | "lg";
}) {
  const box = size === "lg" ? "size-9" : "size-6";
  if (coach) {
    return (
      <img
        src={coach.headshotPath}
        alt={coach.name}
        className={cn(box, "shrink-0 rounded-full object-cover ring-1 ring-border")}
        loading="lazy"
      />
    );
  }
  return (
    <span
      className={cn(box, "flex shrink-0 items-center justify-center rounded-full")}
      style={{ backgroundImage: "linear-gradient(135deg, #3b2418, #c9885a)" }}
    >
      <Coffee className={size === "lg" ? "size-4 text-white" : "size-3 text-white"} />
    </span>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1.5" aria-label="typing">
      {[0, 0.2, 0.4].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  );
}

function Composer({ disabled, onSend }: { disabled: boolean; onSend: (text: string) => void }) {
  const [value, setValue] = useState("");

  const submit = () => {
    if (disabled) return;
    const text = value.trim();
    if (!text) return;
    setValue("");
    onSend(text);
  };

  return (
    <div className="flex items-end gap-2 p-2.5">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
        placeholder="Type your reply…"
        autoFocus
        className="max-h-28 min-h-0 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || value.trim().length === 0}
        aria-label="Send"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
      >
        <Send className="size-4" />
      </button>
    </div>
  );
}
