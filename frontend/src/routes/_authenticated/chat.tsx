import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AIChat } from "@/components/assistant/AIChat";
import { useRegisterHelp } from "@/hooks/use-help";
import { chatHelpContent } from "@/components/help/content/chat-help";

const searchSchema = z.object({
  chatId: z.string().optional(),
  // Help drawer deep-link params; declared here so TanStack Router preserves
  // them on /chat instead of stripping unknown keys per validateSearch.
  help: z.string().optional(),
  anchor: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/chat")({
  validateSearch: searchSchema,
  component: ChatPage,
});

function ChatPage() {
  useRegisterHelp(chatHelpContent);
  const { chatId } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <div className="h-[calc(100vh-3rem)]">
      <AIChat
        variant="full"
        initialChatId={chatId ?? null}
        onCollapse={() => navigate({ to: "/today" })}
      />
    </div>
  );
}
