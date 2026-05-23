import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, AlertCircle } from "lucide-react";
import { getIngestInfo } from "@/lib/crm.functions";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CopyRow } from "@/components/copy-row";
import { TrackingSnippetSection } from "@/components/org-settings-section";
import { WebhooksSettingsSection } from "@/components/webhooks-settings-section";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { useRegisterHelp } from "@/hooks/use-help";
import { integrationsHelpContent } from "@/components/help/content/integrations-help";

export const Route = createFileRoute("/_authenticated/integrations")({
  component: IntegrationsPage,
});

function IntegrationsPage() {
  useRegisterHelp(integrationsHelpContent);
  return (
    <div className="px-6 py-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tracking &amp; Webhooks</h1>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
          pixel · inbound ingestion · outbound events
        </p>
      </div>
      <TrackingSnippetSection />
      <WebhooksTabSection />
      <IngestWebhookSection />
    </div>
  );
}

function WebhooksTabSection() {
  // Gates the webhooks section on org membership — falls back to a "join an
  // org" empty-state when the user isn't in one yet.
  const { orgsQ, orgId } = useCurrentOrg();
  if (!orgsQ.data) return null;
  if (orgId) return <WebhooksSettingsSection />;
  return (
    <Card className="border-border p-5 space-y-2">
      <h2 className="text-sm font-semibold">Webhooks</h2>
      <p className="text-xs text-muted-foreground">Join an org to configure webhooks.</p>
    </Card>
  );
}

function IngestWebhookSection() {
  const ingestFn = useServerFn(getIngestInfo);
  const ingest = useQuery({ queryKey: ["ingest-info"], queryFn: () => ingestFn() });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const ingestUrl = `${origin}/api/public/ingest`;
  const samplePayload = JSON.stringify(
    {
      event: "purchase",
      contact: { email: "user@example.com", full_name: "Jane Doe", company_domain: "example.com" },
      subject: "Annual plan upgrade",
      amount: 4800,
      product: "Pro plan",
    },
    null,
    2,
  );

  return (
    <Card className="border-border p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Activity ingestion webhook</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Push activity from your product, billing, or support systems into Crema. Contacts and
          companies are auto-upserted by email/domain.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Looking for <strong>outbound</strong> webhooks? See above.
        </p>
      </div>

      <div>
        <Label className="text-xs">Endpoint</Label>
        <CopyRow value={ingestUrl} />
      </div>

      <div className="flex items-center gap-2 text-xs">
        {ingest.data?.hasSecret ? (
          <>
            <Check className="size-3.5 text-primary" />
            <span>
              HMAC signature verification enabled (
              <code className="font-mono">INGEST_WEBHOOK_SECRET</code> configured).
            </span>
          </>
        ) : (
          <>
            <AlertCircle className="size-3.5 text-orange-500" />
            <span className="text-muted-foreground">
              No <code className="font-mono">INGEST_WEBHOOK_SECRET</code> set — requests accepted
              without signature. Add the secret in backend config for production.
            </span>
          </>
        )}
      </div>

      <div>
        <Label className="text-xs">Sample payload</Label>
        <pre className="mt-1 p-3 rounded-md bg-muted font-mono text-[11px] overflow-x-auto leading-relaxed">
          {samplePayload}
        </pre>
      </div>

      <div>
        <Label className="text-xs">Example curl</Label>
        <pre className="mt-1 p-3 rounded-md bg-muted font-mono text-[11px] overflow-x-auto">
          {`curl -X POST ${ingestUrl} \\
  -H "Content-Type: application/json" \\${ingest.data?.hasSecret ? `\n  -H "x-signature: <hex hmac-sha256 of body>" \\` : ""}
  -d '${samplePayload.replace(/\n\s*/g, " ")}'`}
        </pre>
      </div>

      <div className="text-xs text-muted-foreground">
        Supported events: <code className="font-mono">pageview</code>,{" "}
        <code className="font-mono">purchase</code>,{" "}
        <code className="font-mono">support_request</code>,{" "}
        <code className="font-mono">signup</code>, <code className="font-mono">email_open</code>,{" "}
        <code className="font-mono">custom</code>. Purchases drive LTV; support requests open
        SLA-tracked tickets.
      </div>
    </Card>
  );
}
