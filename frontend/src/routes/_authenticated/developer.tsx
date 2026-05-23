import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { useNavigate } from "@tanstack/react-router";
import { Terminal, KeyRound, Trash2, Copy, Check, AlertTriangle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyRow } from "@/components/copy-row";
import { listApiKeys, createApiKey, revokeApiKey } from "@/lib/api-keys.functions";
import { useRegisterHelp } from "@/hooks/use-help";
import { developerHelpContent } from "@/components/help/content/developer-help";

const TABS = ["cli", "api"] as const;
const searchSchema = z.object({ tab: z.enum(TABS).optional() });

export const Route = createFileRoute("/_authenticated/developer")({
  validateSearch: searchSchema,
  component: DeveloperPage,
});

function DeveloperPage() {
  useRegisterHelp(developerHelpContent);
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <div className="px-6 py-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CLI / API</h1>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
          api keys · command line · rest reference
        </p>
      </div>

      <Tabs
        value={tab ?? "cli"}
        onValueChange={(v) =>
          navigate({
            to: "/developer",
            search: { tab: v === "cli" ? undefined : (v as (typeof TABS)[number]) },
          })
        }
        className="space-y-5"
      >
        <TabsList>
          <TabsTrigger value="cli">CLI</TabsTrigger>
          <TabsTrigger value="api">API Docs</TabsTrigger>
        </TabsList>

        <TabsContent value="cli" className="space-y-5">
          <ApiKeysSection />
          <CliSection />
        </TabsContent>

        <TabsContent value="api" className="space-y-5">
          <ApiDocsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ApiKeysSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listApiKeys);
  const createFn = useServerFn(createApiKey);
  const revokeFn = useServerFn(revokeApiKey);

  const keysQ = useQuery({ queryKey: ["api-keys"], queryFn: () => listFn() });
  const [name, setName] = useState("");
  // Plaintext of a freshly-minted key — shown once, never retrievable again.
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: (n: string) => createFn({ data: { name: n } }),
    onSuccess: (res) => {
      setFreshKey(res.key);
      setName("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key created");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to create key"),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("API key revoked");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to revoke key"),
  });

  const keys = keysQ.data?.keys ?? [];

  return (
    <Card className="border-border p-5 space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4" style={{ color: "#c9885a" }} />
          <h2 className="text-sm font-semibold">API keys</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Bearer tokens for the <code className="font-mono">/api/v1</code> REST API. A key carries
          your role and current organization — treat it like a password. Use one with the Crema CLI
          or hand it to an AI agent so it can act on your behalf.
        </p>
      </div>

      {freshKey && (
        <div className="rounded-md border border-[#c9885a]/40 bg-[#c9885a]/5 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#c9885a]">
            <AlertTriangle className="size-3.5" />
            Copy this key now — it won't be shown again.
          </div>
          <CopyRow value={freshKey} />
          <button
            className="text-[11px] text-muted-foreground underline underline-offset-2"
            onClick={() => setFreshKey(null)}
          >
            I've saved it — dismiss
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-xs">New key label</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Laptop CLI, Research agent"
            maxLength={60}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) createMut.mutate(name.trim());
            }}
          />
        </div>
        <Button
          size="sm"
          onClick={() => createMut.mutate(name.trim())}
          disabled={!name.trim() || createMut.isPending}
        >
          <Plus className="size-3.5" />
          Create key
        </Button>
      </div>

      <div className="divide-y divide-border border-t border-border">
        {keysQ.isLoading && (
          <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
        )}
        {!keysQ.isLoading && keys.length === 0 && (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No API keys yet. Create one above to use the CLI.
          </div>
        )}
        {keys.map((k) => {
          const revoked = Boolean(k.revoked_at);
          return (
            <div key={k.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{k.name}</span>
                  {revoked && (
                    <Badge variant="outline" className="font-mono text-[9px] uppercase">
                      revoked
                    </Badge>
                  )}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                  {k.key_prefix}··· · created {fmtDate(k.created_at)} ·{" "}
                  {k.last_used_at ? `last used ${fmtDate(k.last_used_at)}` : "never used"}
                </div>
              </div>
              {!revoked && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => revokeMut.mutate(k.id)}
                  disabled={revokeMut.isPending}
                >
                  <Trash2 className="size-3.5" />
                  Revoke
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function CliSection() {
  const apiBase = typeof window !== "undefined" ? window.location.origin : "https://cremasales.com";
  return (
    <Card className="border-border p-5 space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Terminal className="size-4" style={{ color: "#c9885a" }} />
          <h2 className="text-sm font-semibold">Crema CLI</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          A dependency-free command-line client for the Crema API. Every REST endpoint is exposed as
          a subcommand, and <code className="font-mono">--json</code> mode makes it a clean tool
          surface for AI agents. The source lives in <code className="font-mono">/cli</code> of the
          Crema repo.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Install &amp; authenticate</Label>
        <CodeBlock>
          {`# from the Crema repo
cd cli
bun install            # or: npm install

# point it at your account with a key created above
./crema.ts configure   # prompts for the API key + base URL

# or pass them per-invocation
export CREMA_API_KEY=crema_sk_…
export CREMA_API_BASE=${apiBase}`}
        </CodeBlock>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Examples</Label>
        <CodeBlock>
          {`crema me                       # who am I
crema actions                  # prioritized action queue
crema contacts --mine          # my contacts
crema contact <id>             # contact detail + timeline
crema note <id> "Left a vm"    # append a note
crema deals                    # my deals
crema tickets                  # my tickets with SLA flags
crema smoke                    # hit every endpoint, report health
crema raw GET /api/v1/me       # escape hatch for any endpoint
crema me --json                # machine-readable output for agents`}
        </CodeBlock>
      </div>

      <p className="text-[11px] text-muted-foreground">
        See <code className="font-mono">cli/README.md</code> for the full command reference and a
        guide to wiring the CLI into an autonomous agent.
      </p>
    </Card>
  );
}

function ApiDocsSection() {
  return (
    <Card className="border-border overflow-hidden">
      <div className="p-5 pb-3 space-y-1.5">
        <h2 className="text-sm font-semibold">REST API reference</h2>
        <p className="text-xs text-muted-foreground">
          The complete <code className="font-mono">/api/v1</code> surface, generated live from the
          OpenAPI spec at <code className="font-mono">/api/v1/openapi</code>. Authenticate every
          request with <code className="font-mono">Authorization: Bearer &lt;api key&gt;</code>.
        </p>
      </div>
      <iframe
        src="/api/v1/docs"
        title="Crema API reference"
        className="w-full"
        style={{ height: "70vh", border: "none" }}
      />
    </Card>
  );
}

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative group">
      <pre className="p-3 pr-10 rounded-md bg-muted font-mono text-[11px] overflow-x-auto leading-relaxed whitespace-pre">
        {children}
      </pre>
      <button
        className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 border border-border opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => {
          navigator.clipboard.writeText(children);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label="Copy"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
