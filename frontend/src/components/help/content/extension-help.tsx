import type { HelpContent } from "@/hooks/use-help";
import {
  HelpKbd,
  HelpSection,
  HelpTip,
  useAnchorScroll,
} from "@/components/help/content/_layout";

export function ExtensionHelpContent({ activeAnchor }: { activeAnchor?: string }) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="extension-overview" title="Overview">
        <p>
          The Crema browser extension captures Gmail, Calendar, Meet, and
          LinkedIn into your timeline automatically — no manual logging. Hand
          it the cursor and it drafts replies and fills forms while you're on
          a call.
        </p>
        <p>
          It runs on a per-site allow-list, and one click pauses everything.
        </p>
        <HelpTip>
          <span className="text-foreground font-medium">Beta:</span> the
          extension is under active development. Expect rough edges and
          frequent updates — please report anything weird from Support.
        </HelpTip>
      </HelpSection>

      <HelpSection id="extension-install" title="Download & install">
        <p>
          The download button always points at the most recent signed build.
          Re-download whenever you see a "new version available" toast.
        </p>
        <p>
          Install is a Chrome <span className="text-foreground font-medium">Load
          unpacked</span> flow: unzip, open{" "}
          <code className="font-mono text-foreground">chrome://extensions</code>,
          turn on Developer mode, and pick the unzipped folder. Pin the icon so
          you can see when it's recording.
        </p>
      </HelpSection>

      <HelpSection id="extension-verify" title="Verify the build">
        <p>
          After loading, the extension ID shown on{" "}
          <code className="font-mono text-foreground">chrome://extensions</code>{" "}
          should match the ID on this page exactly.
        </p>
        <HelpTip>
          A different ID means you loaded an unsigned dev copy rather than the
          official build. Re-download and reinstall.
        </HelpTip>
      </HelpSection>

      <HelpSection id="extension-connect" title="Connect & browser support">
        <p>
          A loaded extension still has to be linked to this account.{" "}
          <span className="text-foreground font-medium">Connect this
          browser</span> does that — new installs open the step automatically;
          use the button if you reinstalled or your session expired.
        </p>
        <p>
          Chrome, Brave, and Arc work today. Firefox and Edge builds are not
          shipped yet.
        </p>
        <p className="text-xs">
          Tip: hit <HelpKbd>?</HelpKbd> on any page to reopen this drawer.
        </p>
      </HelpSection>
    </div>
  );
}

export const extensionHelpContent: HelpContent = {
  id: "extension",
  title: "Browser extension",
  eyebrow: "crema / help",
  anchors: [
    { id: "extension-overview", label: "Overview" },
    { id: "extension-install", label: "Download & install" },
    { id: "extension-verify", label: "Verify the build" },
    { id: "extension-connect", label: "Connect & browsers" },
  ],
  component: ExtensionHelpContent,
};
