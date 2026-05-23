import type { HelpContent } from "@/hooks/use-help";
import {
  HelpKbd,
  HelpSection,
  HelpTip,
  useAnchorScroll,
} from "@/components/help/content/_layout";

export function DeveloperHelpContent({ activeAnchor }: { activeAnchor?: string }) {
  useAnchorScroll(activeAnchor);

  return (
    <div className="space-y-6 py-4">
      <HelpSection id="developer-overview" title="Overview">
        <p>
          Everything for driving Crema from outside the UI. Two tabs:{" "}
          <span className="text-foreground font-medium">CLI</span> — your API
          keys plus the command-line client — and{" "}
          <span className="text-foreground font-medium">API Docs</span> — the
          live REST reference.
        </p>
      </HelpSection>

      <HelpSection id="developer-keys" title="API keys">
        <p>
          A key is a bearer token for the{" "}
          <code className="font-mono text-foreground">/api/v1</code> REST API.
          It carries <span className="text-foreground font-medium">your role
          and current organization</span> — anyone holding it acts as you, so
          treat it like a password.
        </p>
        <HelpTip>
          The full key is shown <span className="text-foreground font-medium">once</span>,
          right after you create it. There is no way to retrieve it again — if
          you lose it, revoke and mint a new one.
        </HelpTip>
        <p>
          Revoking is immediate and permanent. Revoked keys stay listed as a
          record but stop authenticating.
        </p>
      </HelpSection>

      <HelpSection id="developer-cli" title="Crema CLI">
        <p>
          A dependency-free command-line client that wraps every REST
          endpoint. Its{" "}
          <code className="font-mono text-foreground">--json</code> mode makes
          it a clean tool surface for AI agents — hand an agent a key and it
          can act on your behalf.
        </p>
        <p>
          Source lives in <code className="font-mono text-foreground">/cli</code>{" "}
          of the Crema repo; <code className="font-mono text-foreground">cli/README.md</code>{" "}
          has the full command reference. Authenticate with a key created on
          the CLI tab.
        </p>
      </HelpSection>

      <HelpSection id="developer-api" title="API reference">
        <p>
          The <span className="text-foreground font-medium">API Docs</span> tab
          embeds the complete{" "}
          <code className="font-mono text-foreground">/api/v1</code> surface,
          generated live from the OpenAPI spec. Every request needs an{" "}
          <code className="font-mono text-foreground">Authorization: Bearer
          &lt;key&gt;</code> header.
        </p>
        <p className="text-xs">
          Tip: hit <HelpKbd>?</HelpKbd> on any page to reopen this drawer.
        </p>
      </HelpSection>
    </div>
  );
}

export const developerHelpContent: HelpContent = {
  id: "developer",
  title: "CLI / API",
  eyebrow: "crema / help",
  anchors: [
    { id: "developer-overview", label: "Overview" },
    { id: "developer-keys", label: "API keys" },
    { id: "developer-cli", label: "Crema CLI" },
    { id: "developer-api", label: "API reference" },
  ],
  component: DeveloperHelpContent,
};
