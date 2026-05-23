import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isSpeechAvailable, SpeechSession } from "./speech";

// Minimal stand-in for the browser's SpeechRecognition. Mirrors the surface
// SpeechSession consumes (start/stop/abort + the four event hooks) and exposes
// helpers so tests can synthesise result/error/lifecycle events.
class MockRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  started = false;
  startCalls = 0;
  stopCalls = 0;

  start() {
    if (this.started) {
      const err = new Error("already started");
      err.name = "InvalidStateError";
      throw err;
    }
    this.started = true;
    this.startCalls += 1;
    this.onstart?.();
  }

  stop() {
    this.stopCalls += 1;
    if (!this.started) return;
    this.started = false;
    this.onend?.();
  }

  abort() {
    this.stop();
  }

  emitResults(chunks: { transcript: string; isFinal: boolean }[]) {
    const results = chunks.map((c) => {
      const r: { isFinal: boolean } & Array<{ transcript: string }> = Object.assign(
        [{ transcript: c.transcript }],
        { isFinal: c.isFinal },
      );
      return r;
    });
    this.onresult?.({ resultIndex: 0, results });
  }

  emitError(error: string) {
    this.onerror?.({ error });
  }
}

let lastInstance: MockRecognition | null = null;
function installCtor() {
  (globalThis as { window?: unknown }).window = {
    SpeechRecognition: class extends MockRecognition {
      constructor() {
        super();
        lastInstance = this;
      }
    },
  };
}

function uninstallCtor() {
  delete (globalThis as { window?: unknown }).window;
  lastInstance = null;
}

describe("isSpeechAvailable", () => {
  afterEach(uninstallCtor);

  it("returns false when no SpeechRecognition ctor is present", () => {
    (globalThis as { window?: unknown }).window = {};
    expect(isSpeechAvailable()).toBe(false);
  });

  it("returns true when window.SpeechRecognition is defined", () => {
    installCtor();
    expect(isSpeechAvailable()).toBe(true);
  });

  it("picks up the webkit-prefixed ctor if standard is missing", () => {
    (globalThis as { window?: unknown }).window = { webkitSpeechRecognition: MockRecognition };
    expect(isSpeechAvailable()).toBe(true);
  });
});

describe("SpeechSession lifecycle", () => {
  beforeEach(() => {
    installCtor();
  });
  afterEach(() => {
    vi.useRealTimers();
    uninstallCtor();
  });

  it("transitions idle → listening → idle around start/stop", () => {
    const states: string[] = [];
    const s = new SpeechSession({
      mode: "ptt",
      callbacks: { onStateChange: (st) => states.push(st) },
    });
    expect(s.getState()).toBe("idle");
    s.start();
    expect(s.getState()).toBe("listening");
    s.stop();
    expect(s.getState()).toBe("idle");
    expect(states).toEqual(["listening", "idle"]);
  });

  it("configures the underlying recognition for continuous + interim", () => {
    new SpeechSession({ mode: "ptt", callbacks: {} });
    expect(lastInstance?.continuous).toBe(true);
    expect(lastInstance?.interimResults).toBe(true);
    expect(lastInstance?.lang).toBe("en-US");
  });

  it("forwards lang override", () => {
    new SpeechSession({ mode: "ptt", lang: "fr-FR", callbacks: {} });
    expect(lastInstance?.lang).toBe("fr-FR");
  });

  it("emits not-supported error when ctor is missing", () => {
    uninstallCtor();
    (globalThis as { window?: unknown }).window = {};
    const onError = vi.fn();
    const s = new SpeechSession({ mode: "ptt", callbacks: { onError } });
    s.start();
    expect(onError).toHaveBeenCalledWith("not-supported", expect.any(String));
  });

  it("swallows the InvalidStateError from a double-start", () => {
    const onError = vi.fn();
    const s = new SpeechSession({ mode: "ptt", callbacks: { onError } });
    s.start();
    // Force a second .start() by re-entering — the mock throws InvalidStateError
    // which the session should treat as benign.
    expect(() => s.start()).not.toThrow();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("SpeechSession results", () => {
  beforeEach(installCtor);
  afterEach(uninstallCtor);

  it("forwards interim results without mutating the accumulated buffer", () => {
    const onInterim = vi.fn();
    const s = new SpeechSession({ mode: "ptt", callbacks: { onInterim } });
    s.start();
    lastInstance!.emitResults([{ transcript: "hello wo", isFinal: false }]);
    expect(onInterim).toHaveBeenCalledWith("hello wo");
    expect(s.peek()).toBe("");
  });

  it("forwards final results with the current mode and accumulates them", () => {
    const onFinal = vi.fn();
    const s = new SpeechSession({ mode: "ptt", callbacks: { onFinal } });
    s.start();
    lastInstance!.emitResults([{ transcript: "hello world", isFinal: true }]);
    lastInstance!.emitResults([{ transcript: "goodbye", isFinal: true }]);
    expect(onFinal).toHaveBeenNthCalledWith(1, "hello world", "ptt");
    expect(onFinal).toHaveBeenNthCalledWith(2, "goodbye", "ptt");
    expect(s.peek()).toBe("hello world goodbye");
  });

  it("includes the mode in onFinal when switched to handsfree", () => {
    const onFinal = vi.fn();
    const s = new SpeechSession({ mode: "handsfree", callbacks: { onFinal } });
    s.start();
    lastInstance!.emitResults([{ transcript: "hey", isFinal: true }]);
    expect(onFinal).toHaveBeenCalledWith("hey", "handsfree");
  });
});

describe("SpeechSession PTT onComplete", () => {
  beforeEach(installCtor);
  afterEach(uninstallCtor);

  it("fires onComplete with the full transcript after intentional stop", () => {
    const onComplete = vi.fn();
    const s = new SpeechSession({ mode: "ptt", callbacks: { onComplete } });
    s.start();
    lastInstance!.emitResults([{ transcript: "show me", isFinal: true }]);
    lastInstance!.emitResults([{ transcript: "deals", isFinal: true }]);
    s.stop();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("show me deals", "ptt");
  });

  it("clears the accumulator after onComplete so a second hold starts clean", () => {
    const onComplete = vi.fn();
    const s = new SpeechSession({ mode: "ptt", callbacks: { onComplete } });
    s.start();
    lastInstance!.emitResults([{ transcript: "first", isFinal: true }]);
    s.stop();
    s.start();
    lastInstance!.emitResults([{ transcript: "second", isFinal: true }]);
    s.stop();
    expect(onComplete).toHaveBeenNthCalledWith(1, "first", "ptt");
    expect(onComplete).toHaveBeenNthCalledWith(2, "second", "ptt");
  });

  it("fires onComplete even with an empty buffer so callers can no-op", () => {
    const onComplete = vi.fn();
    const s = new SpeechSession({ mode: "ptt", callbacks: { onComplete } });
    s.start();
    s.stop();
    expect(onComplete).toHaveBeenCalledWith("", "ptt");
  });
});

describe("SpeechSession handsfree silence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installCtor();
  });
  afterEach(() => {
    vi.useRealTimers();
    uninstallCtor();
  });

  it("fires onSilence with the accumulated transcript after silenceMs of quiet", () => {
    const onSilence = vi.fn();
    const s = new SpeechSession({
      mode: "handsfree",
      silenceMs: 500,
      callbacks: { onSilence },
    });
    s.start();
    lastInstance!.emitResults([{ transcript: "book a demo", isFinal: true }]);
    expect(onSilence).not.toHaveBeenCalled();
    vi.advanceTimersByTime(499);
    expect(onSilence).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSilence).toHaveBeenCalledWith("book a demo");
  });

  it("resets the silence timer when new speech arrives", () => {
    const onSilence = vi.fn();
    const s = new SpeechSession({
      mode: "handsfree",
      silenceMs: 500,
      callbacks: { onSilence },
    });
    s.start();
    lastInstance!.emitResults([{ transcript: "one", isFinal: true }]);
    vi.advanceTimersByTime(400);
    lastInstance!.emitResults([{ transcript: "two", isFinal: true }]);
    vi.advanceTimersByTime(400);
    expect(onSilence).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onSilence).toHaveBeenCalledWith("one two");
  });

  it("does not arm the silence timer in PTT mode", () => {
    const onSilence = vi.fn();
    const s = new SpeechSession({
      mode: "ptt",
      silenceMs: 500,
      callbacks: { onSilence },
    });
    s.start();
    lastInstance!.emitResults([{ transcript: "one", isFinal: true }]);
    vi.advanceTimersByTime(10_000);
    expect(onSilence).not.toHaveBeenCalled();
  });
});

describe("SpeechSession errors", () => {
  beforeEach(installCtor);
  afterEach(uninstallCtor);

  it("maps not-allowed → permission-denied with a human message", () => {
    const onError = vi.fn();
    const s = new SpeechSession({ mode: "ptt", callbacks: { onError } });
    s.start();
    lastInstance!.emitError("not-allowed");
    expect(onError).toHaveBeenCalledTimes(1);
    const [code, message] = onError.mock.calls[0];
    expect(code).toBe("permission-denied");
    expect(message).toMatch(/permission/i);
  });

  it("suppresses no-speech errors so handsfree pauses stay quiet", () => {
    const onError = vi.fn();
    const s = new SpeechSession({ mode: "handsfree", callbacks: { onError } });
    s.start();
    lastInstance!.emitError("no-speech");
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ["aborted", "aborted"],
    ["network", "network"],
    ["weird-thing", "unknown"],
  ])("maps %s → %s", (raw, expected) => {
    const onError = vi.fn();
    const s = new SpeechSession({ mode: "ptt", callbacks: { onError } });
    s.start();
    lastInstance!.emitError(raw);
    expect(onError).toHaveBeenCalledWith(expected, expect.any(String));
  });
});

describe("SpeechSession auto-restart on browser-initiated end", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installCtor();
  });
  afterEach(() => {
    vi.useRealTimers();
    uninstallCtor();
  });

  it("restarts the underlying recognition when it ends unexpectedly", () => {
    const s = new SpeechSession({ mode: "handsfree", callbacks: {} });
    s.start();
    const inst = lastInstance!;
    expect(inst.startCalls).toBe(1);
    // Simulate the browser ending the session on its own (no .stop() call).
    inst.started = false;
    inst.onend?.();
    vi.advanceTimersByTime(250);
    expect(inst.startCalls).toBe(2);
    // Sanity: state should be listening again after the restart.
    expect(s.getState()).toBe("listening");
  });

  it("does NOT restart after an intentional stop", () => {
    const s = new SpeechSession({ mode: "ptt", callbacks: {} });
    s.start();
    const inst = lastInstance!;
    s.stop();
    vi.advanceTimersByTime(500);
    expect(inst.startCalls).toBe(1);
  });
});

describe("SpeechSession setMode", () => {
  beforeEach(installCtor);
  afterEach(uninstallCtor);

  it("returns the current mode via getMode", () => {
    const s = new SpeechSession({ mode: "ptt", callbacks: {} });
    expect(s.getMode()).toBe("ptt");
    s.setMode("handsfree");
    expect(s.getMode()).toBe("handsfree");
  });

  it("stops an in-flight session when the mode flips while listening", () => {
    const s = new SpeechSession({ mode: "ptt", callbacks: {} });
    s.start();
    const inst = lastInstance!;
    expect(inst.started).toBe(true);
    s.setMode("handsfree");
    expect(inst.started).toBe(false);
  });
});

describe("SpeechSession destroy", () => {
  beforeEach(installCtor);
  afterEach(uninstallCtor);

  it("nulls out handlers so events can't fire after teardown", () => {
    const onFinal = vi.fn();
    const s = new SpeechSession({ mode: "ptt", callbacks: { onFinal } });
    s.start();
    const inst = lastInstance!;
    s.destroy();
    expect(inst.onresult).toBeNull();
    expect(inst.onerror).toBeNull();
    expect(inst.onend).toBeNull();
    expect(inst.onstart).toBeNull();
  });
});
