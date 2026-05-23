import { Link, useNavigate } from "@tanstack/react-router";
import { Chrome, Download, ExternalLink, AlertCircle, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CopyRow } from "@/components/copy-row";
import { EXTENSION_ID } from "@/lib/extension";
import { useExtensionStatus } from "@/hooks/use-extension-status";
import { appendMessage, createChat } from "@/lib/chat-storage";

// Canned task for the live demo. Seeded as the rep's first message into a
// fresh copilot chat; the agent has browser tools (`browserOpen`,
// `browserReadPage`, …) and drives the rep's own signed-in LinkedIn through
// the extension, narrating each step. Phrased to ask for narration explicitly
// so the rep watches the extension work rather than just getting a result.
const DEMO_PROMPT = `Let's do a quick live demo of what you can do with my browser.

Open my LinkedIn feed (https://www.linkedin.com/feed/) in my browser and look around — recent posts, what people in my network are up to, anything notable. Then give me:

1. A short read on what's happening in my network right now.
2. A concrete game plan: who I should engage with and how (a comment, a message, a connection request).

Narrate each step as you go — tell me when you open the tab, when you're reading the page, and what catches your eye — so I can see exactly how you drive the browser.`;

// Self-hosted at /downloads/ rather than the GitHub release so reps don't
// need to be signed into the private repo. Re-upload the file (same name)
// when a new build ships and the URL stays stable.
const EXTENSION_DOWNLOAD_URL = "/downloads/crema-agent-latest.zip";
const EXTENSION_RELEASES_URL = "https://github.com/Crema-Sales/Crema-CRM/releases";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="font-mono shrink-0 tabular-nums" style={{ color: "#c9885a" }}>
        {n}.
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

// Download + install + connect flow for the Crema browser extension. Lifted
// out of Settings into its own "Browser Extension" sidebar page.
export function ExtensionSection() {
  const navigate = useNavigate();
  const { connected } = useExtensionStatus();

  // Seed a fresh copilot chat with the demo task and hand off to /chat, where
  // `AIChat` auto-resumes the unanswered user message and the agent runs it.
  const startDemo = () => {
    const chat = createChat("Live demo — LinkedIn");
    appendMessage(chat.id, { role: "user", content: DEMO_PROMPT });
    void navigate({ to: "/chat", search: { chatId: chat.id } });
  };

  return (
    <Card className="border-border p-5 space-y-5">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Chrome className="size-4" style={{ color: "#c9885a" }} />
          <h2 className="text-sm font-semibold">Browser extension</h2>
          <span
            className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-full border leading-none"
            style={{ color: "#c9885a", borderColor: "#c9885a55", backgroundColor: "#c9885a1f" }}
          >
            Beta
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Captures Gmail, Calendar, Meet, and LinkedIn into your timeline automatically. Hand it the
          cursor and it drafts replies and fills forms while you're on a call. Per-site allow-list;
          one click pauses everything.
        </p>
        <p className="text-[11px] text-muted-foreground italic">
          The extension is in beta and under active development — expect rough edges and frequent
          updates while we harden it.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Download</Label>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={EXTENSION_DOWNLOAD_URL}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold text-background hover:brightness-95 transition-all"
            style={{ backgroundColor: "#c9885a" }}
          >
            <Download className="size-3.5" />
            crema-agent-latest.zip
          </a>
          <a
            href={EXTENSION_RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Release notes <ExternalLink className="size-3" />
          </a>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Always points at the most recent signed build. Re-download whenever you see a "new version
          available" toast.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Install</Label>
        <ol className="space-y-2 text-xs text-muted-foreground">
          <Step n={1}>Unzip the download.</Step>
          <Step n={2}>
            Open <code className="font-mono text-foreground">chrome://extensions</code> in a new
            tab.
          </Step>
          <Step n={3}>
            Toggle <span className="text-foreground font-medium">Developer mode</span> on (top-right
            of the page).
          </Step>
          <Step n={4}>
            Click <span className="text-foreground font-medium">Load unpacked</span> and pick the
            unzipped folder.
          </Step>
          <Step n={5}>Pin the Crema icon to the toolbar so you can see when it's recording.</Step>
        </ol>
      </div>

      <div className="pt-3 border-t border-border space-y-1.5">
        <Label className="text-xs">Verify</Label>
        <p className="text-[11px] text-muted-foreground">
          The ID listed under the extension on{" "}
          <code className="font-mono">chrome://extensions</code> should match exactly. A different
          ID means an unsigned dev copy.
        </p>
        <CopyRow value={EXTENSION_ID} />
      </div>

      <div className="pt-3 border-t border-border space-y-1.5">
        <Label className="text-xs">Connect &amp; try it</Label>
        <p className="text-[11px] text-muted-foreground">
          Once the extension is loaded, link it to this account. New installs open this step
          automatically; use the button if you reinstalled or your session expired.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            to="/extension/onboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold text-background hover:brightness-95 transition-all"
            style={{ backgroundColor: "#c9885a" }}
          >
            Connect this browser
          </Link>
          <button
            type="button"
            onClick={startDemo}
            disabled={!connected}
            title={connected ? undefined : "Connect the extension first to run the demo"}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold border border-border text-foreground transition-all hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            style={connected ? { borderColor: "#c9885a", color: "#c9885a" } : undefined}
          >
            <Sparkles className="size-3.5" />
            Run a live demo
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {connected
            ? "Live demo: Crema opens LinkedIn in this browser, looks around, and hands you a prospecting game plan — narrated step by step in the copilot. Make sure the toolbar switch is ON."
            : "The live demo unlocks once the extension is connected — Crema will drive LinkedIn for you and build a prospecting game plan."}
        </p>
      </div>

      <div className="pt-3 border-t border-border flex items-start gap-2 text-[11px] text-muted-foreground">
        <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
        <span>Firefox and Edge builds are not shipped yet. Chrome, Brave, and Arc work today.</span>
      </div>
    </Card>
  );
}
