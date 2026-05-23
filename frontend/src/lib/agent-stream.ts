// Thin native WebSocket client for the RepAgent chat backend.
//
// The `@cloudflare/ai-chat` server speaks a stable JSON envelope on its WS:
//
//   client → server: { id, type: "cf_agent_use_chat_request", init: { method: "POST",
//                       body: JSON.stringify({ messages: UIMessage[], trigger }) } }
//   server → client: { type: "cf_agent_use_chat_response", id, body: <JSON chunk>, done }
//
// We don't pull `@cloudflare/ai-chat/react` into the frontend — the existing
// AIChat component already manages multi-chat localStorage + UI. We just need
// the streaming bytes. This file is the minimum surface for that.

export type AgentRole = "user" | "assistant" | "system";

export type AgentChatHistoryEntry = {
  id: string;
  role: AgentRole;
  content: string;
};

export type StreamCallbacks = {
  /** Fires every time the model emits text. Concatenate `chunk` onto your buffer. */
  onTextDelta: (chunk: string) => void;
  /** Fires when the model starts calling a tool. Render a tool-call chip indicator. */
  onToolCall?: (info: { toolName: string; toolCallId: string; input: unknown }) => void;
  /** Fires when a tool call completes. Render a small result chip if you want. */
  onToolResult?: (info: { toolName: string; toolCallId: string; output: unknown }) => void;
  /** Fires once when the stream closes normally. */
  onFinish?: () => void;
};

export type StreamOptions = StreamCallbacks & {
  token: string;
  prompt: string;
  history: AgentChatHistoryEntry[];
  baseUrl?: string;
  signal?: AbortSignal;
  /** Max ms with no frame before we abort. Default 30_000. */
  idleTimeoutMs?: number;
};

function nanoid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function wsUrl(base: string, token: string): string {
  const noTrail = base.replace(/\/+$/, "");
  const ws = noTrail.replace(/^http/, "ws");
  return `${ws}/v1/agent?token=${encodeURIComponent(token)}`;
}

function toUiMessage(entry: { id?: string; role: AgentRole; content: string }) {
  return {
    id: entry.id ?? nanoid(),
    role: entry.role,
    parts: [{ type: "text" as const, text: entry.content }],
  };
}

/**
 * Stream one RepAgent turn. Resolves with the final assistant text once the
 * server signals `done`. Rejects on socket error, auth failure, or idle timeout.
 *
 * The caller is expected to be holding an open chat-storage row and updating it
 * on every `onTextDelta` — this function deliberately does not touch storage.
 */
export async function streamAgentReply(opts: StreamOptions): Promise<string> {
  // Fallback points at the deployed agent Worker so prod builds without a
  // `.env` still hit a real backend. `.env` is gitignored, so we can't ship
  // the prod URL through there — bake it into the source instead. Local dev
  // overrides via `VITE_API_BASE=http://localhost:8787` in `.env.local`.
  const base =
    opts.baseUrl ??
    import.meta.env.VITE_API_BASE ??
    "https://ctrl-alt-elite-agent.smashlabs.workers.dev";
  const idleTimeoutMs = opts.idleTimeoutMs ?? 30_000;

  const ws = new WebSocket(wsUrl(base, opts.token));
  const requestId = nanoid();

  let assembled = "";
  let resolveDone: ((text: string) => void) | null = null;
  let rejectDone: ((err: Error) => void) | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      try { ws.close(1000); } catch { /* noop */ }
      rejectDone?.(new Error(`agent stream idle for ${idleTimeoutMs}ms`));
    }, idleTimeoutMs);
  };

  const cleanup = () => {
    if (idleTimer) clearTimeout(idleTimer);
    opts.signal?.removeEventListener("abort", abortHandler);
  };

  const abortHandler = () => {
    try { ws.close(1000); } catch { /* noop */ }
    rejectDone?.(new Error("aborted"));
  };

  if (opts.signal) {
    if (opts.signal.aborted) return Promise.reject(new Error("aborted"));
    opts.signal.addEventListener("abort", abortHandler, { once: true });
  }

  ws.addEventListener("open", () => {
    armIdle();
    // Build the message list the server expects: prior turns + this new user
    // turn. The server replays them through its own persistence; the client
    // here only mirrors the locally-known transcript.
    const messages = [
      ...opts.history.map((m) => toUiMessage(m)),
      toUiMessage({ role: "user", content: opts.prompt }),
    ];
    ws.send(
      JSON.stringify({
        id: requestId,
        type: "cf_agent_use_chat_request",
        init: {
          method: "POST",
          body: JSON.stringify({ messages, trigger: "submit-message" }),
        },
      }),
    );
  });

  ws.addEventListener("message", (event) => {
    armIdle();
    let envelope: {
      type?: string;
      id?: string;
      body?: string;
      done?: boolean;
      error?: boolean;
    };
    try {
      envelope = JSON.parse(typeof event.data === "string" ? event.data : "");
    } catch {
      return;
    }
    if (envelope.type !== "cf_agent_use_chat_response") return;
    if (envelope.id && envelope.id !== requestId) return;

    if (envelope.error) {
      rejectDone?.(new Error(envelope.body || "stream error"));
      return;
    }

    if (envelope.body && envelope.body.trim()) {
      let chunk: Record<string, unknown>;
      try {
        chunk = JSON.parse(envelope.body);
      } catch {
        return;
      }
      handleChunk(chunk);
    }

    if (envelope.done) {
      cleanup();
      try { ws.close(1000); } catch { /* noop */ }
      opts.onFinish?.();
      resolveDone?.(assembled);
    }
  });

  ws.addEventListener("close", (event) => {
    cleanup();
    if (event.code === 1008) {
      rejectDone?.(new Error("unauthorized — JWT rejected by backend"));
      return;
    }
    // If we never got a `done`, treat the close as success only if we already
    // accumulated text. Otherwise surface as an error.
    if (assembled.length > 0) resolveDone?.(assembled);
    else rejectDone?.(new Error(`socket closed (code=${event.code})`));
  });

  ws.addEventListener("error", () => {
    rejectDone?.(new Error("websocket error"));
  });

  const handleChunk = (chunk: Record<string, unknown>) => {
    const type = chunk.type;
    if (type === "text-delta" && typeof chunk.delta === "string") {
      assembled += chunk.delta;
      opts.onTextDelta(chunk.delta);
      return;
    }
    // `tool-input-available` is fired once the args are fully parsed.
    if (type === "tool-input-available" && typeof chunk.toolName === "string") {
      // Emit a structured marker rather than markdown text — the chat renderer
      // (see `MessageBody`) splits on `[[crema:tool:NAME]]` and swaps in a
      // styled chip. The marker is persisted into chat storage as-is.
      const annotation = `\n\n[[crema:tool:${chunk.toolName}]]\n\n`;
      assembled += annotation;
      opts.onTextDelta(annotation);
      opts.onToolCall?.({
        toolName: chunk.toolName,
        toolCallId: String(chunk.toolCallId ?? ""),
        input: chunk.input,
      });
      return;
    }
    if (type === "tool-output-available" && typeof chunk.toolName === "string") {
      opts.onToolResult?.({
        toolName: chunk.toolName,
        toolCallId: String(chunk.toolCallId ?? ""),
        output: chunk.output,
      });
      return;
    }
    // Other chunk types (reasoning-*, source-*, file, step-start, data-*) are
    // ignored — the UI doesn't render them yet. Easy to extend later.
  };

  return new Promise<string>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
}
