import { useEffect, useState } from "react";
import { Plus, Search, Trash2, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  type Chat,
  chatPreview,
  createChat,
  deleteChat,
  listChats,
  searchChats,
  subscribeToChats,
} from "@/lib/chat-storage";

export function ChatList({
  activeChatId,
  onSelect,
  onNew,
  compact = false,
}: {
  activeChatId: string | null;
  onSelect: (chatId: string) => void;
  onNew: (chatId: string) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [chats, setChats] = useState<Chat[]>([]);

  useEffect(() => {
    const refresh = () => setChats(query ? searchChats(query) : listChats());
    refresh();
    return subscribeToChats(refresh);
  }, [query]);

  const handleNew = () => {
    const c = createChat();
    onNew(c.id);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteChat(id);
    if (id === activeChatId) {
      const remaining = listChats();
      if (remaining.length > 0) onSelect(remaining[0].id);
      else handleNew();
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className={cn("flex items-center gap-1.5", compact ? "p-2" : "p-3")}>
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className="pl-7 h-8 text-xs"
          />
        </div>
        <Button size="sm" variant="outline" onClick={handleNew} className="h-8 px-2" title="New chat">
          <Plus className="size-3.5" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-0.5">
        {chats.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-6">
            {query ? "No matches." : "No chats yet."}
          </div>
        ) : (
          chats.map((c) => {
            const preview = chatPreview(c);
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "w-full text-left px-2 py-2 rounded-md hover:bg-accent transition-colors group flex items-start gap-2",
                  c.id === activeChatId && "bg-accent",
                )}
              >
                <MessageSquare className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{c.title}</div>
                  {preview && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
                      {preview}
                    </div>
                  )}
                  <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-1">
                    {formatDistanceToNow(c.updatedAt, { addSuffix: true })} · {c.messages.length} msg
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(e, c.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5"
                  title="Delete chat"
                  aria-label="Delete chat"
                >
                  <Trash2 className="size-3" />
                </button>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
