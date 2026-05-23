import { useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/lib/chat-storage";
import { InlineMarkdown } from "./inline-markdown";
import { MessageBody } from "./message-body";

// Opening line + suggestion chips for an empty chat. Kept here so the
// copilot drives the conversation from the first paint — the rep never has
// to guess what Crema does.
const OPENING_TEXT =
  "Morning ☕  I'm **Crema** — wired into your pipeline. I can pull up your action queue, flag what's slipping, or surface a prospect worth a follow-up.\n\nWhat do you want me to dig into?";

const SUGGESTIONS: string[] = [
  "Pull up my action queue",
  "Who needs a follow-up today?",
  "Bubble up a funnel contact",
  "What can you do for me?",
];

export function ChatMessageList({
  messages,
  pendingInterim,
  emptyHint,
  onSuggestionClick,
}: {
  messages: ChatMessage[];
  pendingInterim?: string;
  emptyHint?: string;
  onSuggestionClick?: (text: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastMessageContent = messages[messages.length - 1]?.content ?? "";

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, lastMessageContent, pendingInterim]);

  if (messages.length === 0 && !pendingInterim) {
    return (
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-3">
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted text-foreground px-3 py-2 text-sm whitespace-pre-wrap break-words">
            <InlineMarkdown text={emptyHint ?? OPENING_TEXT} />
          </div>
        </div>
        {onSuggestionClick && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSuggestionClick(s)}
                className="rounded-full border border-border bg-background/60 hover:bg-muted text-xs px-3 py-1 text-foreground transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
      {messages.map((m) => (
        <Bubble key={m.id} message={m} />
      ))}
      {pendingInterim && (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary/40 text-primary-foreground px-3 py-2 text-sm italic">
            {pendingInterim}
            <span className="ml-1 inline-block animate-pulse">▍</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm",
        )}
      >
        {message.content && (
          <div>
            {isUser ? message.content : <MessageBody text={message.content} />}
          </div>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.attachments.map((a) =>
              a.kind === "image" ? (
                <img
                  key={a.id}
                  src={a.dataUrl}
                  alt={a.name ?? "attachment"}
                  className="max-h-40 max-w-[12rem] rounded-md object-cover ring-1 ring-border"
                />
              ) : (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-mono ring-1 ring-border hover:bg-background/40 transition-colors",
                    isUser ? "bg-primary/80" : "bg-background",
                  )}
                >
                  <ExternalLink className="size-3" />
                  <span className="truncate max-w-[14rem]">{prettyUrl(a.url)}</span>
                </a>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function prettyUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.hostname + (url.pathname === "/" ? "" : url.pathname);
  } catch {
    return u;
  }
}
