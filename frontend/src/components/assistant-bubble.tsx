import { createContext, useContext, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, LifeBuoy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AIChat } from "@/components/assistant/AIChat";
import { SupportPanel, useUnreadOverdueCount } from "@/components/assistant/SupportPanel";
import { getMyCoachPersona } from "@/auth/coach-persona-fns";
import { COACH_PERSONAS_BY_SLUG } from "@/lib/coach-personas";

type Tab = "ai" | "support";

type AssistantContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const AssistantCtx = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <AssistantCtx.Provider value={{ open, setOpen }}>{children}</AssistantCtx.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantCtx);
  if (!ctx) throw new Error("useAssistant must be used inside <AssistantProvider>");
  return ctx;
}

export function AssistantBubble() {
  const navigate = useNavigate();
  const { open, setOpen } = useAssistant();
  const [tab, setTab] = useState<Tab>("ai");

  // Single source of truth: every badge (avatar bubble, support tab, "My
  // tickets" tab) shows the count of overdue tickets the user hasn't cleared.
  const unreadOverdue = useUnreadOverdueCount();

  const coachFn = useServerFn(getMyCoachPersona);
  const coachQ = useQuery({
    queryKey: ["my-coach-persona"],
    queryFn: () => coachFn(),
    staleTime: 60_000,
  });
  const coach = coachQ.data?.slug ? COACH_PERSONAS_BY_SLUG[coachQ.data.slug] ?? null : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={coach ? `Open assistant with ${coach.name}` : "Open assistant"}
          data-tour-id="assistant-bubble"
          className="group fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-xl transition-transform hover:-translate-y-0.5 hover:shadow-2xl active:scale-95"
          style={{
            backgroundImage: coach ? undefined : "linear-gradient(135deg, #3b2418, #c9885a)",
            boxShadow: "0 10px 30px -8px rgba(107, 58, 31, 0.6)",
          }}
          title={coach ? `Channeling ${coach.name}` : undefined}
        >
          <span className="absolute inset-0 rounded-full overflow-hidden flex items-center justify-center">
            {coach ? (
              <img
                src={coach.headshotPath}
                alt={coach.name}
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <CoffeePotIcon />
            )}
          </span>
          {unreadOverdue > 0 && (
            <span className="absolute -top-1 -right-1 size-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center ring-2 ring-background animate-pulse z-10">
              {unreadOverdue}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={12}
        className="w-[540px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-6rem)] p-0 overflow-hidden flex"
      >
        <nav className="w-12 border-r border-border bg-muted/30 flex flex-col items-center py-2 gap-1 shrink-0">
          <TabButton active={tab === "ai"} onClick={() => setTab("ai")} label="AI">
            <Sparkles className="size-4" />
          </TabButton>
          <TabButton active={tab === "support"} onClick={() => setTab("support")} label="Support" badge={unreadOverdue > 0 ? unreadOverdue : undefined}>
            <LifeBuoy className="size-4" />
          </TabButton>
        </nav>
        <div className="flex-1 min-w-0 relative">
          {tab === "ai" ? (
            <AIChat
              variant="compact"
              onExpand={() => {
                setOpen(false);
                navigate({ to: "/chat" });
              }}
            />
          ) : (
            <div className="flex flex-col h-full min-h-0">
              <div className="px-3 py-2 border-b border-border shrink-0">
                <div className="text-sm font-semibold">Support</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">how can we help?</div>
              </div>
              <div className="flex-1 min-h-0">
                <SupportPanel onClose={() => setOpen(false)} />
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TabButton({
  active,
  onClick,
  label,
  badge,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "relative w-9 h-9 rounded-md flex items-center justify-center transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/50",
      )}
      title={label}
    >
      {children}
      {badge !== undefined && (
        <span className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center ring-1 ring-background">
          {badge}
        </span>
      )}
    </button>
  );
}

function CoffeePotIcon() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none" className="mx-auto">
      <g stroke="white" strokeWidth="1.6" strokeLinecap="round" fill="none">
        <path d="M7 8.5 Q8 7 7 5.5 Q6 4 7 2.5" style={{ animation: "steamRise 2.4s ease-in-out infinite" }} />
        <path d="M10.5 8.5 Q11.5 7 10.5 5.5 Q9.5 4 10.5 2.5" style={{ animation: "steamRise 2.4s ease-in-out infinite", animationDelay: "0.5s" }} />
        <path d="M14 8.5 Q15 7 14 5.5 Q13 4 14 2.5" style={{ animation: "steamRise 2.4s ease-in-out infinite", animationDelay: "1s" }} />
      </g>
      <g stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M5 10 H16 V18 Q16 20 14 20 H7 Q5 20 5 18 Z" />
        <path d="M16 12 Q19.5 12.4 19.5 14.5 Q19.5 16.6 16 17" />
        <path d="M4 11 H17" />
        <path d="M3 21 H18" strokeWidth="1.5" />
      </g>
    </svg>
  );
}
