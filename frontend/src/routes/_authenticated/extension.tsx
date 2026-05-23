import { createFileRoute } from "@tanstack/react-router";
import { ExtensionSection } from "@/components/extension-section";
import { useRegisterHelp } from "@/hooks/use-help";
import { extensionHelpContent } from "@/components/help/content/extension-help";

export const Route = createFileRoute("/_authenticated/extension")({
  component: ExtensionPage,
});

function ExtensionPage() {
  useRegisterHelp(extensionHelpContent);
  return (
    <div className="px-6 py-6 max-w-3xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight">Browser Extension</h1>
          <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-accent/40 bg-accent/15 text-accent">
            Beta
          </span>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
          capture · assist · automate
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          The extension is in <strong className="text-foreground">beta</strong> and under active development.
          Expect rough edges and frequent updates — please report anything weird from Support.
        </p>
      </div>
      <ExtensionSection />
    </div>
  );
}
