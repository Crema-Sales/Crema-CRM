// Web Speech API wrapper. Two modes:
//   ptt        — caller starts/stops manually; transcript returned via onFinal.
//   handsfree  — continuous listening; after `silenceMs` with no new speech,
//                onSilence fires with accumulated text and the session auto-rearms.
//
// Browser support: Chrome / Edge / Safari (webkit-prefixed). Firefox has no
// implementation — callers should feature-detect via `isSpeechAvailable()`
// and hide the mic affordance when false.

export type SpeechMode = "ptt" | "handsfree";

export type SpeechState = "idle" | "listening";

export type SpeechErrorCode =
  | "not-supported"
  | "permission-denied"
  | "no-speech"
  | "aborted"
  | "network"
  | "unknown";

export type SpeechCallbacks = {
  onInterim?: (text: string) => void;
  onFinal?: (text: string, mode: SpeechMode) => void;
  onSilence?: (text: string) => void;
  // Fires once after an intentional stop() with the full accumulated transcript
  // (may be empty). PTT callers use this to release-and-send without depending
  // on React state flushing in time after the last onFinal.
  onComplete?: (text: string, mode: SpeechMode) => void;
  onError?: (code: SpeechErrorCode, message: string) => void;
  onStateChange?: (state: SpeechState) => void;
};

type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

function getCtor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechAvailable(): boolean {
  return getCtor() !== null;
}

export class SpeechSession {
  private rec: RecognitionLike | null = null;
  private mode: SpeechMode;
  private cb: SpeechCallbacks;
  private silenceMs: number;
  private state: SpeechState = "idle";
  private intentionalStop = false;
  private accumulated = "";
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: { mode: SpeechMode; silenceMs?: number; lang?: string; callbacks?: SpeechCallbacks }) {
    this.mode = opts.mode;
    this.silenceMs = opts.silenceMs ?? 2200;
    this.cb = opts.callbacks ?? {};

    const Ctor = getCtor();
    if (!Ctor) {
      // Defer the error to start() so callers can construct conditionally without throwing.
      return;
    }
    this.rec = new Ctor();
    this.rec.lang = opts.lang ?? "en-US";
    this.rec.interimResults = true;
    // Always continuous: PTT needs it so a brief pause doesn't end the session
    // mid-press, and handsfree needs it for obvious reasons. We control session
    // end via stop() / handleEnd() restart logic.
    this.rec.continuous = true;

    this.rec.onresult = (e: any) => this.handleResult(e);
    this.rec.onerror = (e: any) => this.handleError(e);
    this.rec.onend = () => this.handleEnd();
    this.rec.onstart = () => this.setState("listening");
  }

  setMode(mode: SpeechMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.state === "listening") {
      this.intentionalStop = true;
      try {
        this.rec?.stop();
      } catch {
        // ignore
      }
    }
  }

  start(): void {
    if (!this.rec) {
      this.cb.onError?.("not-supported", "Web Speech API is not available in this browser.");
      return;
    }
    if (this.state === "listening") return;
    this.intentionalStop = false;
    this.accumulated = "";
    try {
      this.rec.start();
    } catch (err: any) {
      // Chrome throws "InvalidStateError" if start() is called while already starting.
      // Treat as benign; the onstart callback will resolve state.
      if (err?.name !== "InvalidStateError") {
        this.cb.onError?.("unknown", err?.message ?? String(err));
      }
    }
  }

  stop(): void {
    this.intentionalStop = true;
    this.clearSilenceTimer();
    this.clearRestartTimer();
    if (!this.rec) return;
    try {
      this.rec.stop();
    } catch {
      // ignore
    }
  }

  destroy(): void {
    this.stop();
    if (this.rec) {
      this.rec.onresult = null;
      this.rec.onerror = null;
      this.rec.onend = null;
      this.rec.onstart = null;
    }
  }

  getState(): SpeechState {
    return this.state;
  }

  getMode(): SpeechMode {
    return this.mode;
  }

  peek(): string {
    return this.accumulated;
  }

  private setState(s: SpeechState) {
    if (this.state === s) return;
    this.state = s;
    this.cb.onStateChange?.(s);
  }

  private handleResult(e: any) {
    let interimChunk = "";
    let finalChunk = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      const transcript = result[0]?.transcript ?? "";
      if (result.isFinal) finalChunk += transcript;
      else interimChunk += transcript;
    }
    if (finalChunk) {
      this.accumulated = (this.accumulated + " " + finalChunk).trim();
      this.cb.onFinal?.(finalChunk.trim(), this.mode);
    }
    if (interimChunk) {
      this.cb.onInterim?.(interimChunk.trim());
    }
    if (this.mode === "handsfree") this.armSilenceTimer();
  }

  private armSilenceTimer() {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      const text = this.accumulated.trim();
      if (text) {
        this.cb.onSilence?.(text);
        this.accumulated = "";
      }
    }, this.silenceMs);
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private clearRestartTimer() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private handleError(e: any) {
    const raw = String(e?.error ?? "unknown");
    let code: SpeechErrorCode = "unknown";
    if (raw === "not-allowed" || raw === "service-not-allowed") code = "permission-denied";
    else if (raw === "no-speech") code = "no-speech";
    else if (raw === "aborted") code = "aborted";
    else if (raw === "network") code = "network";
    const message =
      code === "permission-denied"
        ? "Microphone permission denied. Allow it in your browser site settings."
        : raw;
    // no-speech is normal during long handsfree pauses; suppress.
    if (code !== "no-speech") this.cb.onError?.(code, message);
  }

  private handleEnd() {
    const wasIntentional = this.intentionalStop;
    this.setState("idle");
    this.clearSilenceTimer();
    // Both modes keep the mic alive across natural recognition restarts. Some
    // browsers end the session after a pause (or a ~60s ceiling) even with
    // continuous=true; for PTT that would cut audio mid-press, and for
    // handsfree it would silently stop listening.
    if (!wasIntentional && this.rec) {
      this.restartTimer = setTimeout(() => {
        try {
          this.rec?.start();
        } catch {
          // swallow — onerror will surface anything fatal
        }
      }, 250);
    }
    this.intentionalStop = false;
    if (wasIntentional) {
      const full = this.accumulated;
      this.accumulated = "";
      this.cb.onComplete?.(full, this.mode);
    }
  }
}
