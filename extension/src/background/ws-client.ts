/**
 * AgentSocket — outbound WSS to the rep's RepAgent Durable Object.
 *
 * Spec: shared/agent-ws-protocol.md
 *  - 25s ping cadence, 3 missed pongs (75s) → force close + reconnect
 *  - exponential backoff [1, 2, 4, 8, 16, 32]s, cap 60s, ±20% jitter
 *  - DO drains queue on (re)connect; we just dial.
 */

export interface AgentConfig {
  baseUrl: string;
  repId: string;
  jwt: string;
}

export type AgentMessageHandler = (msg: unknown) => void | Promise<void>;

const PING_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 75_000;
const BACKOFF_LADDER_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000];
const BACKOFF_CAP_MS = 60_000;
const JITTER = 0.2;

// Terminal close codes from the backend. Spec: shared/agent-ws-protocol.md.
// On 4401 we additionally wipe the cached JWT so the rep is forced through a
// fresh `agent_handoff` from cremasales.com before the SW tries to dial again.
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_FORBIDDEN = 4403;
const TERMINAL_CLOSE_CODES = new Set([CLOSE_UNAUTHORIZED, CLOSE_FORBIDDEN]);

export type ConnectionStatus = "idle" | "connecting" | "open" | "closed";

export class AgentSocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<AgentMessageHandler>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongWatchdog: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffStep = 0;
  private lastPongAt = 0;
  private explicitlyClosed = false;
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private currentStatus: ConnectionStatus = "idle";

  constructor(private readonly getConfig: () => Promise<AgentConfig>) {}

  onMessage(handler: AgentMessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onStatus(listener: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.currentStatus);
    return () => this.statusListeners.delete(listener);
  }

  status(): ConnectionStatus {
    return this.currentStatus;
  }

  isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    this.explicitlyClosed = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.cancelReconnect();

    let cfg: AgentConfig;
    try {
      cfg = await this.getConfig();
    } catch (err) {
      console.warn("[agent] config unavailable, deferring connect:", err);
      this.scheduleReconnect();
      return;
    }
    if (!cfg.baseUrl || !cfg.repId || !cfg.jwt) {
      console.warn("[agent] config incomplete; not connecting");
      this.setStatus("idle");
      return;
    }

    const base = cfg.baseUrl.replace(/^http(s?):/i, (_, s) => `ws${s}:`).replace(/\/+$/, "");
    const url = `${base}/agents/${encodeURIComponent(cfg.repId)}/ws?token=${encodeURIComponent(cfg.jwt)}`;

    this.setStatus("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.warn("[agent] WebSocket construct failed:", err);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      console.log("[agent] connected");
      this.backoffStep = 0;
      this.lastPongAt = Date.now();
      this.setStatus("open");
      this.startHeartbeat();
    });

    ws.addEventListener("message", (ev) => {
      const data = typeof ev.data === "string" ? ev.data : "";
      if (!data) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        console.warn("[agent] non-JSON frame dropped");
        return;
      }
      if (parsed && typeof parsed === "object" && (parsed as { type?: unknown }).type === "pong") {
        this.lastPongAt = Date.now();
        return;
      }
      for (const h of this.handlers) {
        try {
          void h(parsed);
        } catch (err) {
          console.error("[agent] handler threw:", err);
        }
      }
    });

    ws.addEventListener("close", (ev) => {
      console.log("[agent] disconnected", ev.code, ev.reason);
      this.cleanupSocket();
      this.setStatus("closed");

      if (TERMINAL_CLOSE_CODES.has(ev.code)) {
        // Both terminal codes require a fresh handoff from cremasales.com.
        // Wipe creds so the next connect() short-circuits on
        // "config incomplete" instead of dialing in a tight loop driven by
        // the keepalive alarm. The baseUrl stays so the fresh handoff
        // doesn't need to re-discover it.
        const reason = ev.code === CLOSE_UNAUTHORIZED ? "token rejected" : "rep forbidden";
        console.error(
          `[agent] terminal close ${ev.code} (${reason}). Wiping JWT — rep must re-auth at cremasales.com.`,
        );
        chrome.storage.local.remove(["agentJwt", "agentRepId"]).catch((err) => {
          console.warn("[agent] failed to clear stored credentials:", err);
        });
        this.explicitlyClosed = true;
        return;
      }

      if (!this.explicitlyClosed) this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      // browsers fire close after error; nothing to do here.
    });
  }

  disconnect(): void {
    this.explicitlyClosed = true;
    this.cancelReconnect();
    this.cleanupSocket();
    if (this.ws) {
      try {
        this.ws.close(1000, "client_disconnect");
      } catch {
        // ignore
      }
    }
    this.ws = null;
    this.setStatus("idle");
  }

  send(msg: object): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(msg));
      return true;
    } catch (err) {
      console.warn("[agent] send failed:", err);
      return false;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      const sent = this.send({ type: "ping" });
      if (!sent) return;
      if (Date.now() - this.lastPongAt > PONG_TIMEOUT_MS) {
        console.warn("[agent] pong watchdog tripped — forcing close");
        try {
          this.ws?.close(4000, "pong_timeout");
        } catch {
          // ignore
        }
      }
    }, PING_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongWatchdog) {
      clearTimeout(this.pongWatchdog);
      this.pongWatchdog = null;
    }
  }

  private cleanupSocket() {
    this.stopHeartbeat();
  }

  private scheduleReconnect() {
    if (this.explicitlyClosed) return;
    this.cancelReconnect();
    const base = BACKOFF_LADDER_MS[Math.min(this.backoffStep, BACKOFF_LADDER_MS.length - 1)] ?? BACKOFF_CAP_MS;
    const capped = Math.min(base, BACKOFF_CAP_MS);
    const jitter = capped * JITTER * (Math.random() * 2 - 1);
    const delay = Math.max(500, Math.round(capped + jitter));
    this.backoffStep += 1;
    console.log(`[agent] reconnecting in ${delay}ms (step ${this.backoffStep})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private cancelReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(s: ConnectionStatus) {
    if (s === this.currentStatus) return;
    this.currentStatus = s;
    for (const l of this.statusListeners) {
      try {
        l(s);
      } catch (err) {
        console.error("[agent] status listener threw:", err);
      }
    }
  }
}

export async function readAgentConfig(): Promise<AgentConfig> {
  const out = await chrome.storage.local.get(["agentBaseUrl", "agentRepId", "agentJwt"]);
  return {
    baseUrl: typeof out.agentBaseUrl === "string" ? out.agentBaseUrl : "",
    repId: typeof out.agentRepId === "string" ? out.agentRepId : "",
    jwt: typeof out.agentJwt === "string" ? out.agentJwt : "",
  };
}
