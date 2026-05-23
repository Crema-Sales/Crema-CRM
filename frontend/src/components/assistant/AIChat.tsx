import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, PanelLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type Chat,
  type ChatAttachment,
  appendMessage,
  createChat,
  getChat,
  listChats,
  subscribeToChats,
  updateMessage,
} from "@/lib/chat-storage";
import { getAgentToken } from "@/lib/agent-token-fns";
import { streamAgentReply } from "@/lib/agent-stream";
import { getMyCoachPersona } from "@/auth/coach-persona-fns";
import { COACH_PERSONAS_BY_SLUG } from "@/lib/coach-personas";
import { ChatList } from "./ChatList";
import { ChatMessageList } from "./ChatMessageList";
import { ChatComposer } from "./ChatComposer";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useDefaultLayout } from "react-resizable-panels";

export type AIChatVariant = "compact" | "full";

export function AIChat({
  variant,
  initialChatId,
  onExpand,
  onCollapse,
  className,
}: {
  variant: AIChatVariant;
  initialChatId?: string | null;
  onExpand?: () => void;
  onCollapse?: () => void;
  className?: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(initialChatId ?? null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(variant === "full");
  const tokenRef = useRef<string | null>(null);
  // `tokenReady` flips once the JWT fetch resolves (token may still be null if
  // signed out). The auto-resume effect waits on it so it doesn't fire before
  // the copilot can authenticate.
  const [tokenReady, setTokenReady] = useState(false);
  // Guards the one-shot auto-resume so it can't re-fire as the chat mutates.
  const autoRanRef = useRef(false);

  const coachFn = useServerFn(getMyCoachPersona);
  const coachQ = useQuery({
    queryKey: ["my-coach-persona"],
    queryFn: () => coachFn(),
    staleTime: 60_000,
  });
  const coach = coachQ.data?.slug ? COACH_PERSONAS_BY_SLUG[coachQ.data.slug] ?? null : null;
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "crema:aichat:sidebar",
    panelIds: ["chat-list", "chat-thread"],
  });

  // Pick / create an active chat on mount.
  useEffect(() => {
    if (activeId) return;
    const existing = listChats();
    if (existing.length > 0) setActiveId(existing[0].id);
    else setActiveId(createChat().id);
  }, [activeId]);

  // Fetch the rep JWT once per component instance. The token is the same JWT
  // the user signed in with (ctv_auth cookie); both Workers share the signing
  // key so the backend's verifyRepJwt accepts it directly.
  useEffect(() => {
    let cancelled = false;
    getAgentToken().then((res) => {
      if (cancelled) return;
      tokenRef.current = res.token;
      setTokenReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Watch the active chat from storage so other tabs / routes stay in sync.
  useEffect(() => {
    if (!activeId) return;
    const refresh = () => setChat(getChat(activeId));
    refresh();
    return subscribeToChats(refresh);
  }, [activeId]);

  // Stream an assistant reply for a chat whose latest user turn is already
  // persisted. Shared by `handleSubmit` (which appends the user message first)
  // and the auto-resume effect (which answers an externally-seeded user
  // message — e.g. the extension demo landing on /chat?chatId=…).
  const runAssistantReply = useCallback((chatId: string, promptText: string) => {
    const token = tokenRef.current;
    if (!token) {
      appendMessage(chatId, {
        role: "assistant",
        content: "_Sign in again — copilot can't verify your session._",
      });
      return;
    }

    const assistant = appendMessage(chatId, { role: "assistant", content: "" });

    const priorMessages = (getChat(chatId)?.messages ?? [])
      .filter((m) => m.id !== assistant.id && m.content.trim().length > 0)
      .map((m) => ({ id: m.id, role: m.role, content: m.content }));

    streamAgentReply({
      token,
      prompt: promptText,
      history: priorMessages,
      onTextDelta: (chunk) => {
        updateMessage(chatId, assistant.id, (prev) => ({
          ...prev,
          content: prev.content + chunk,
        }));
      },
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[copilot] stream failed", err);
      const isAuth = /unauthorized|jwt/i.test(msg);
      updateMessage(chatId, assistant.id, (prev) => {
        if (prev.content.length > 0) {
          return {
            ...prev,
            content: `${prev.content}\n\n_Copilot disconnected before finishing — your message is saved._`,
          };
        }
        return {
          ...prev,
          content: isAuth
            ? "_Sign in again — copilot can't verify your session._"
            : "Copilot offline — your message is saved. The RepAgent will pick this up once wired.",
        };
      });
    });
  }, []);

  const handleSubmit = useCallback(
    ({ text, attachments }: { text: string; attachments: ChatAttachment[] }) => {
      if (!activeId) return;
      appendMessage(activeId, {
        role: "user",
        content: text,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      runAssistantReply(activeId, text);
    },
    [activeId, runAssistantReply],
  );

  // Auto-resume: if the active chat's last turn is an unanswered user message,
  // stream a reply once the token is ready. This is how the extension live
  // demo runs — `extension-section.tsx` seeds a fresh chat with the demo
  // prompt and routes here; the copilot picks it up and drives the browser.
  // During normal use `handleSubmit` always appends an assistant message right
  // after the user's, so a trailing user message only ever means "seeded".
  // Scoped to the full view so a compact bubble mounted on the same chat
  // can't also fire and double-answer.
  useEffect(() => {
    if (variant !== "full" || autoRanRef.current || !tokenReady || !activeId || !chat) return;
    const last = chat.messages[chat.messages.length - 1];
    if (!last || last.role !== "user" || !last.content.trim()) return;
    autoRanRef.current = true;
    runAssistantReply(activeId, last.content);
  }, [variant, tokenReady, activeId, chat, runAssistantReply]);

  const handleSuggestion = useCallback(
    (text: string) => handleSubmit({ text, attachments: [] }),
    [handleSubmit],
  );

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    if (variant === "compact") setSidebarOpen(false);
  }, [variant]);

  const handleNew = useCallback((id: string) => {
    setActiveId(id);
    if (variant === "compact") setSidebarOpen(false);
  }, [variant]);

  const sidebar = (
    <ChatList
      activeChatId={activeId}
      onSelect={handleSelect}
      onNew={handleNew}
      compact={variant === "compact"}
    />
  );

  return (
    <div className={cn("flex flex-col h-full min-h-0 bg-background", className)}>
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border shrink-0">
        <div className="flex items-center gap-1">
          {variant === "compact" && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setSidebarOpen((v) => !v)}
              title="Chats"
              aria-label="Toggle chat list"
            >
              <PanelLeft className="size-3.5" />
            </Button>
          )}
          <div className="text-xs font-medium truncate max-w-[14rem]">
            {chat?.title ?? "New chat"}
          </div>
          {coach ? (
            <span
              className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-foreground"
              title={`Channeling ${coach.name} — "${coach.tagline}"`}
            >
              <img
                src={coach.headshotPath}
                alt=""
                className="h-3.5 w-3.5 rounded-full object-cover"
                loading="lazy"
              />
              <span className="hidden sm:inline">w/ {coach.name.split(" ")[0]}</span>
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {variant === "compact" && onExpand && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onExpand} title="Open full chat">
              <Maximize2 className="size-3.5" />
            </Button>
          )}
          {variant === "full" && onCollapse && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCollapse} title="Minimize">
              <Minimize2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 relative">
        {variant === "full" ? (
          <ResizablePanelGroup
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
            className="flex-1 min-h-0"
          >
            <ResizablePanel
              id="chat-list"
              defaultSize="22%"
              minSize="14%"
              maxSize="45%"
              className="hidden md:flex flex-col min-h-0 border-r border-border"
            >
              {sidebar}
            </ResizablePanel>
            <ResizableHandle withHandle className="hidden md:flex" />
            <ResizablePanel
              id="chat-thread"
              defaultSize="78%"
              minSize="40%"
              className="flex flex-col min-h-0 min-w-0"
            >
              <ChatMessageList messages={chat?.messages ?? []} onSuggestionClick={handleSuggestion} />
              <ChatComposer onSubmit={handleSubmit} coachName={coach?.name ?? null} />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <>
            {sidebarOpen && (
              <div className="absolute inset-0 z-20 bg-background flex flex-col min-h-0">
                {sidebar}
                <div className="border-t border-border p-2">
                  <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => setSidebarOpen(false)}>
                    Back to chat
                  </Button>
                </div>
              </div>
            )}
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              <ChatMessageList messages={chat?.messages ?? []} onSuggestionClick={handleSuggestion} />
              <ChatComposer onSubmit={handleSubmit} coachName={coach?.name ?? null} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
