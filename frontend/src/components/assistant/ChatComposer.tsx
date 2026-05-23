import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hand, Mic, Paperclip, Send, X, Image as ImageIcon, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { extractUrls, fileToDataUrl } from "@/lib/image-utils";
import { isSpeechAvailable, SpeechSession } from "@/lib/speech";
import type { ChatAttachment } from "@/lib/chat-storage";

type ActiveMode = "handsfree" | "ptt" | null;

type PendingAttachment = ChatAttachment;

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export function ChatComposer({
  onSubmit,
  disabled,
  coachName,
}: {
  onSubmit: (payload: { text: string; attachments: PendingAttachment[] }) => void;
  disabled?: boolean;
  coachName?: string | null;
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [activeMode, setActiveMode] = useState<ActiveMode>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");

  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const speechRef = useRef<SpeechSession | null>(null);
  const stateRef = useRef({ text: "", attachments: [] as PendingAttachment[] });
  const activeModeRef = useRef<ActiveMode>(null);
  // Set on PTT release (button or Ctrl key) so the next onComplete from the
  // session submits the composed message instead of merely inserting it.
  const pttShouldSubmitRef = useRef(false);

  // Keep a ref of the latest text/attachments so the speech callbacks
  // (created once) always see fresh state without re-creating the session.
  useEffect(() => {
    stateRef.current = { text, attachments };
  }, [text, attachments]);

  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

  // Focus the composer on mount so opening the assistant (via ⌘J, the launcher
  // pill, or the /chat route) drops the caret straight into the input. The
  // rAF gives Radix's popover focus trap a tick to settle first.
  useEffect(() => {
    const raf = requestAnimationFrame(() => textRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  const speechSupported = useMemo(() => isSpeechAvailable(), []);

  const submitNow = useCallback(
    (override?: { text?: string; attachments?: PendingAttachment[] }) => {
      const finalText = (override?.text ?? stateRef.current.text).trim();
      const finalAtts = override?.attachments ?? stateRef.current.attachments;
      if (!finalText && finalAtts.length === 0) return;
      onSubmit({ text: finalText, attachments: finalAtts });
      setText("");
      setAttachments([]);
      setInterim("");
    },
    [onSubmit],
  );

  // Initialise the speech session once. Mode is patched in-place from the
  // hands-free / push-to-talk handlers via session.setMode().
  useEffect(() => {
    if (!speechSupported) return;
    const session = new SpeechSession({
      mode: "ptt",
      silenceMs: 2200,
      callbacks: {
        onInterim: (t) => setInterim(t),
        onFinal: (chunk, mode) => {
          setInterim("");
          // In PTT mode the textarea stays clean — the full transcript lands in
          // onComplete on release, which submits in one shot. Hands-free keeps
          // streaming finals into the textarea so the user sees what was heard.
          if (mode === "handsfree") {
            setText((prev) => (prev ? prev + " " + chunk : chunk));
          }
        },
        onSilence: (full) => {
          // Hands-free auto-send. Splice the accumulated transcript into whatever
          // the user has typed so we don't drop manual edits made mid-listening.
          const composed = (stateRef.current.text ? stateRef.current.text + " " : "") + full;
          submitNow({ text: composed, attachments: stateRef.current.attachments });
        },
        onComplete: (full, mode) => {
          if (mode !== "ptt") return;
          if (!pttShouldSubmitRef.current) return;
          pttShouldSubmitRef.current = false;
          const transcript = full.trim();
          const typed = stateRef.current.text.trim();
          const composed = typed && transcript ? typed + " " + transcript : typed || transcript;
          if (!composed && stateRef.current.attachments.length === 0) return;
          submitNow({ text: composed, attachments: stateRef.current.attachments });
        },
        onError: (code, message) => {
          if (code === "permission-denied") toast.error("Mic permission denied", { description: message });
          else if (code !== "aborted" && code !== "no-speech") toast.error("Mic error", { description: message });
          pttShouldSubmitRef.current = false;
          setListening(false);
          setActiveMode(null);
        },
        onStateChange: (s) => {
          const isListening = s === "listening";
          setListening(isListening);
          if (!isListening) setActiveMode(null);
        },
      },
    });
    speechRef.current = session;
    return () => {
      session.destroy();
      speechRef.current = null;
    };
  }, [speechSupported, submitNow]);

  const addImageFiles = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    const results = await Promise.all(
      images.map(async (f) => {
        try {
          const { dataUrl, mime } = await fileToDataUrl(f);
          return { id: uid(), kind: "image" as const, dataUrl, mime, name: f.name };
        } catch (err: any) {
          toast.error("Could not load image", { description: err?.message ?? String(err) });
          return null;
        }
      }),
    );
    setAttachments((prev) => [...prev, ...(results.filter(Boolean) as PendingAttachment[])]);
  }, []);

  const addUrl = useCallback((url: string) => {
    setAttachments((prev) =>
      prev.some((a) => a.kind === "link" && a.url === url)
        ? prev
        : [...prev, { id: uid(), kind: "link" as const, url }],
    );
  }, []);

  const onPaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        await addImageFiles(files);
        return;
      }
      const pastedText = e.clipboardData.getData("text");
      const urls = extractUrls(pastedText);
      // If the pasted text is *only* a URL, surface it as a chip instead of inline.
      if (urls.length === 1 && urls[0].trim() === pastedText.trim()) {
        e.preventDefault();
        addUrl(urls[0]);
        return;
      }
      // Mixed text — let the default paste run and add any URLs as chips too.
      urls.forEach(addUrl);
    },
    [addImageFiles, addUrl],
  );

  const onDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length === 0) return;
      await addImageFiles(files);
    },
    [addImageFiles],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitNow();
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Hands-free: tap-toggle on/off; auto-sends after a silence beat.
  const onHandsFreeClick = () => {
    const session = speechRef.current;
    if (!session) return;
    if (activeMode === "handsfree" && listening) {
      session.stop();
      return;
    }
    session.setMode("handsfree");
    setActiveMode("handsfree");
    session.start();
  };

  // PTT: press-and-hold, release to send. Pointer capture keeps pointerup
  // firing even if the cursor drifts off the button mid-hold.
  const startPtt = useCallback(() => {
    const session = speechRef.current;
    if (!session) return;
    if (activeModeRef.current !== null) return;
    pttShouldSubmitRef.current = true;
    session.setMode("ptt");
    setActiveMode("ptt");
    session.start();
  }, []);

  const stopPtt = useCallback(() => {
    // pttShouldSubmitRef stays true so the session's onComplete fires submit.
    speechRef.current?.stop();
  }, []);

  const onPttDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    startPtt();
  };
  const onPttUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    stopPtt();
  };

  // Global Ctrl-hold → PTT. We arm after a short grace so chord shortcuts
  // (Ctrl+C, Ctrl+S, etc.) don't briefly flap the mic. While armed (mic not
  // yet on), any other key cancels; once started, only Ctrl-up stops it.
  useEffect(() => {
    if (!speechSupported) return;
    const ARM_MS = 180;
    let armTimer: ReturnType<typeof setTimeout> | null = null;
    let ctrlPttActive = false;

    const cancelArm = () => {
      if (armTimer) {
        clearTimeout(armTimer);
        armTimer = null;
      }
    };

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key !== "Control") {
        // Any non-Control key cancels a pending arm so Ctrl+X chords are safe.
        cancelArm();
        return;
      }
      if (ev.repeat || ctrlPttActive || armTimer) return;
      if (ev.shiftKey || ev.altKey || ev.metaKey) return;
      if (activeModeRef.current !== null) return;
      armTimer = setTimeout(() => {
        armTimer = null;
        ctrlPttActive = true;
        startPtt();
      }, ARM_MS);
    };

    const onKeyUp = (ev: KeyboardEvent) => {
      if (ev.key !== "Control") return;
      cancelArm();
      if (ctrlPttActive) {
        ctrlPttActive = false;
        stopPtt();
      }
    };

    const onBlur = () => {
      // If the window loses focus mid-hold, browsers may drop the keyup.
      // Bail out so we don't leave the mic stuck on.
      cancelArm();
      if (ctrlPttActive) {
        ctrlPttActive = false;
        pttShouldSubmitRef.current = false;
        speechRef.current?.stop();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      cancelArm();
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [speechSupported, startPtt, stopPtt]);

  return (
    <div
      onDragEnter={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          setDragActive(true);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
        }
      }}
      onDragLeave={(e) => {
        // Only deactivate when leaving the composer wrapper, not children.
        if (e.currentTarget === e.target) setDragActive(false);
      }}
      onDrop={onDrop}
      className={cn(
        "border-t border-border bg-background/50 p-2 space-y-2 relative",
        dragActive && "ring-2 ring-primary ring-inset",
      )}
    >
      {dragActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/10 backdrop-blur-sm rounded-b-md pointer-events-none z-10">
          <div className="text-xs font-mono uppercase tracking-widest text-primary">Drop images to attach</div>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((a) => (
            <AttachmentChip key={a.id} attachment={a} onRemove={() => removeAttachment(a.id)} />
          ))}
        </div>
      )}

      <div className="flex items-stretch gap-1.5">
        {speechSupported && (
          <div className="flex flex-col gap-1.5 shrink-0">
            <Button
              type="button"
              variant={activeMode === "ptt" ? "default" : "outline"}
              className={cn(
                "h-9 px-2.5 gap-1.5",
                activeMode === "ptt" && listening && "animate-pulse",
              )}
              onPointerDown={onPttDown}
              onPointerUp={onPttUp}
              onPointerCancel={onPttUp}
              title="Hold (or hold ⌃ Control) to dictate; release to send"
              aria-label="Push and hold to talk, release to send"
            >
              <Hand className="size-4" />
              <span className="text-xs font-medium">Hold to Talk</span>
            </Button>
            <Button
              type="button"
              variant={activeMode === "handsfree" ? "default" : "outline"}
              className={cn(
                "h-9 px-2.5 gap-1.5",
                activeMode === "handsfree" && listening && "animate-pulse",
              )}
              onClick={onHandsFreeClick}
              title={activeMode === "handsfree" ? "Stop hands-free" : "Tap to start listening; auto-sends after a pause"}
              aria-label="Hands-free listening"
              aria-pressed={activeMode === "handsfree"}
            >
              <Mic className="size-4" />
              <span className="text-xs font-medium">Hands-free</span>
            </Button>
          </div>
        )}
        <Textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={
            listening
              ? "Listening…"
              : coachName
                ? `Work with ${coachName}. Paste, drag images, or hit the mic.`
                : "Message your copilot. Paste, drag images, or hit the mic."
          }
          rows={3}
          className="resize-none text-sm min-h-[78px] flex-1"
          disabled={disabled}
        />
        <div className="flex flex-col gap-1.5 shrink-0">
          <FileInputButton onPick={addImageFiles} />
          <Button
            type="button"
            size="icon"
            className="h-9 w-9"
            onClick={() => submitNow()}
            disabled={disabled || (!text.trim() && attachments.length === 0)}
            title="Send"
            aria-label="Send"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>

      {/* Always reserve a row so the composer doesn't jitter as interim
          transcripts arrive/clear during push-to-talk. */}
      <div className="text-[11px] text-muted-foreground italic px-1 min-h-[1.125rem]">
        {interim && (
          <>
            <span className="font-mono uppercase tracking-widest text-[9px] mr-1.5">interim</span>
            {interim}
          </>
        )}
      </div>
    </div>
  );
}

function AttachmentChip({ attachment, onRemove }: { attachment: PendingAttachment; onRemove: () => void }) {
  if (attachment.kind === "image") {
    return (
      <div className="relative group">
        <img src={attachment.dataUrl} alt={attachment.name ?? ""} className="h-14 w-14 rounded-md object-cover ring-1 ring-border" />
        <button
          onClick={onRemove}
          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Remove attachment"
        >
          <X className="size-3" />
        </button>
        <div className="absolute bottom-0.5 left-0.5 bg-background/80 rounded p-0.5">
          <ImageIcon className="size-2.5 text-muted-foreground" />
        </div>
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-xs ring-1 ring-border group">
      <Link2 className="size-3 text-muted-foreground" />
      <span className="truncate max-w-[14rem] font-mono text-[11px]">{prettyUrl(attachment.url)}</span>
      <button
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Remove link"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function FileInputButton({ onPick }: { onPick: (files: File[]) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onPick(files);
          if (ref.current) ref.current.value = "";
        }}
      />
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-9 w-9 shrink-0"
        onClick={() => ref.current?.click()}
        title="Attach images"
        aria-label="Attach images"
      >
        <Paperclip className="size-4" />
      </Button>
    </>
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
