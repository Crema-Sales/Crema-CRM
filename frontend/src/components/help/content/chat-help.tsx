import { Link } from "@tanstack/react-router";

import type { HelpContent } from "@/hooks/use-help";
import { HelpKbd, HelpSection, HelpTip, useAnchorScroll } from "@/components/help/content/_layout";

export function ChatHelpContent({ activeAnchor }: { activeAnchor?: string }) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="chat-overview" title="Overview">
        <p>
          The chat page is the full-screen view of your sales copilot. Left column is the list of
          past conversations; right column is the current thread.
        </p>
        <p>
          The same conversation backend powers the floating assistant in the bottom-right corner of
          every other page. Open a thread here and it shows up in the bubble; reply from the bubble
          and it appears here on next reload. The two views differ in size, not in data.
        </p>
        <HelpTip>
          Heads up: the assistant currently replies with a placeholder ("Copilot offline — your
          message is saved…"). Your messages are stored locally and will be picked up by the
          RepAgent backend once it's wired in. Until then, treat the chat as a scratchpad.
        </HelpTip>
      </HelpSection>

      <HelpSection id="chat-commands" title="What the composer takes">
        <p>There are no slash commands today — you just type. Other input options:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <HelpKbd>Enter</HelpKbd> sends. <HelpKbd>Shift</HelpKbd>+<HelpKbd>Enter</HelpKbd>{" "}
            inserts a newline.
          </li>
          <li>
            <span className="text-foreground font-medium">Paperclip</span> or drag-and-drop attaches
            images. Pasting an image from the clipboard works too.
          </li>
          <li>
            Pasting a bare URL turns it into a link chip above the textarea. Pasting mixed text
            leaves the URL inline.
          </li>
          <li>
            <span className="text-foreground font-medium">Push</span> mode: hold the mic to dictate,
            release to insert. <span className="text-foreground font-medium">Hands-free</span> mode:
            tap to start, auto-sends after a couple seconds of silence. The mic only appears when
            the browser supports speech recognition.
          </li>
        </ul>
      </HelpSection>

      <HelpSection id="chat-history" title="Threads and history">
        <p>
          Every thread shows up in the left sidebar, newest activity first. The{" "}
          <span className="text-foreground font-medium">+</span> button starts a new thread;
          clicking an existing row resumes it. The search box matches against both titles and
          message bodies.
        </p>
        <p>
          A thread auto-titles itself from the first message you send (first 60 characters). Hover a
          row to reveal the trash icon if you want to delete it.
        </p>
        <p>
          History is currently stored in this browser's localStorage — clearing site data wipes it,
          and another device won't see the same threads. That changes once the RepAgent backend is
          wired; the storage shape is intentionally close to what the server will return.
        </p>
        <p>
          To get back to the rest of the app, click the{" "}
          <span className="text-foreground font-medium">Minimize</span> icon in the chat header (it
          lands you on{" "}
          <Link to="/today" className="underline hover:text-foreground">
            Today
          </Link>
          ) or use the sidebar nav.
        </p>
        <p className="text-xs">
          Tip: hit <HelpKbd>?</HelpKbd> on any page to reopen this drawer.
        </p>
      </HelpSection>
    </div>
  );
}

export const chatHelpContent: HelpContent = {
  id: "chat",
  title: "Chat",
  eyebrow: "crema / help",
  anchors: [
    { id: "chat-overview", label: "Overview" },
    { id: "chat-commands", label: "Composer input" },
    { id: "chat-history", label: "Threads and history" },
  ],
  component: ChatHelpContent,
};
