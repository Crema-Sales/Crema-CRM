// Local-only chat persistence. Will be superseded by a Durable Object
// once the RepAgent is wired up — keep the shape close to what the DO
// will return so the swap stays small.

export type ChatRole = "user" | "assistant" | "system";

export type ChatAttachment =
  | { id: string; kind: "image"; dataUrl: string; name?: string; mime: string }
  | { id: string; kind: "link"; url: string; title?: string };

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  attachments?: ChatAttachment[];
  createdAt: number;
};

export type Chat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

const STORAGE_KEY = "crema:chats:v1";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readAll(): Record<string, Chat> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(chats: Record<string, Chat>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    // Cross-tab/component fanout — components listen via "storage" + this custom event.
    window.dispatchEvent(new CustomEvent("crema:chats:changed"));
  } catch {
    // Quota or serialization failure — surface via toast at call site, not here.
  }
}

// Pick the first sentence-ish chunk of the seed message, break at a word
// boundary, and strip trailing punctuation. RepAgent will replace this with
// a real LLM-generated title once wired.
function deriveTitle(content: string): string {
  const firstLine = content.trim().split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const collapsed = firstLine.replace(/\s+/g, " ").trim();
  if (collapsed.length <= 48) return collapsed.replace(/[\s.,!?;:—-]+$/, "");
  const slice = collapsed.slice(0, 48);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 24 ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/[\s.,!?;:—-]+$/, "") + "…";
}

export function chatPreview(chat: Chat): string {
  const last = [...chat.messages].reverse().find((m) => m.content.trim().length > 0);
  if (!last) return "";
  const prefix = last.role === "user" ? "You: " : last.role === "assistant" ? "" : "";
  return prefix + last.content.replace(/\s+/g, " ").trim();
}

export function listChats(): Chat[] {
  const all = readAll();
  return Object.values(all).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getChat(id: string): Chat | null {
  return readAll()[id] ?? null;
}

export function createChat(initialTitle?: string): Chat {
  const now = Date.now();
  const chat: Chat = {
    id: uid(),
    title: initialTitle?.trim() || "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  const all = readAll();
  all[chat.id] = chat;
  writeAll(all);
  return chat;
}

export function appendMessage(
  chatId: string,
  msg: Omit<ChatMessage, "id" | "createdAt"> & Partial<Pick<ChatMessage, "id" | "createdAt">>,
): ChatMessage {
  const all = readAll();
  const chat = all[chatId];
  if (!chat) throw new Error(`chat ${chatId} not found`);
  const full: ChatMessage = {
    id: msg.id ?? uid(),
    createdAt: msg.createdAt ?? Date.now(),
    role: msg.role,
    content: msg.content,
    attachments: msg.attachments,
  };
  chat.messages.push(full);
  chat.updatedAt = full.createdAt;
  // Auto-title from the first user message so the list isn't all "New chat".
  if (chat.title === "New chat" && full.role === "user" && full.content.trim()) {
    chat.title = deriveTitle(full.content);
  }
  all[chatId] = chat;
  writeAll(all);
  return full;
}

export function updateMessage(
  chatId: string,
  messageId: string,
  patch: (prev: ChatMessage) => ChatMessage,
): void {
  const all = readAll();
  const chat = all[chatId];
  if (!chat) return;
  const idx = chat.messages.findIndex((m) => m.id === messageId);
  if (idx < 0) return;
  chat.messages[idx] = patch(chat.messages[idx]);
  chat.updatedAt = Date.now();
  writeAll(all);
}

export function renameChat(chatId: string, title: string): void {
  const all = readAll();
  const chat = all[chatId];
  if (!chat) return;
  chat.title = title.trim() || chat.title;
  chat.updatedAt = Date.now();
  writeAll(all);
}

export function deleteChat(chatId: string): void {
  const all = readAll();
  if (!(chatId in all)) return;
  delete all[chatId];
  writeAll(all);
}

export function searchChats(query: string): Chat[] {
  const q = query.trim().toLowerCase();
  if (!q) return listChats();
  return listChats().filter((c) => {
    if (c.title.toLowerCase().includes(q)) return true;
    return c.messages.some((m) => m.content.toLowerCase().includes(q));
  });
}

export function subscribeToChats(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener("crema:chats:changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("crema:chats:changed", handler);
    window.removeEventListener("storage", handler);
  };
}
