import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMe, updateProfile } from "@/lib/crm.functions";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Wand2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { OrgSettingsSection } from "@/components/org-settings-section";
import { PromptsSection } from "@/components/prompts-section";
import { useCurrentOrg } from "@/hooks/use-current-org";
import { StageProbabilitiesSection } from "@/components/stage-probabilities-section";
import { MembersQuotasSection } from "@/components/members-quotas-section";
import { DomainVerificationSection } from "@/components/domain-verification-section";
import { JoinLinksSection } from "@/components/join-links-section";
import { AuditLogSection } from "@/components/audit-log-section";
import { AllUsersSection } from "@/components/all-users-section";
import { CoachPersonaSection } from "@/components/coach-persona-section";
import { useTour } from "@/components/tour/tour-context";
import { resetAllOnboarding } from "@/lib/onboarding-flags";
import { useShortcutHints } from "@/hooks/use-shortcuts";
import { useRegisterHelp } from "@/hooks/use-help";
import { settingsHelpContent } from "@/components/help/content/settings-help";
import { METHODOLOGIES, METHODOLOGY_KEYS, type MethodologyKey } from "@/lib/sales-methodology";

const USER_METHODOLOGY_INHERIT = "__inherit__";
const USER_SYSTEM_PROMPT_MAX = 4000;

const SETTINGS_TABS = ["user", "organization", "prompts"] as const;

const searchSchema = z.object({
  // Deep-link target tab, e.g. /settings?tab=extension from the marketing page.
  tab: z.enum(SETTINGS_TABS).optional(),
  // Deep-link focus target, e.g. /settings?focus=invite from the command
  // palette. The destination section autofocuses the matching control.
  focus: z.enum(["invite"]).optional(),
});

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: searchSchema,
  component: SettingsPage,
});

function SettingsPage() {
  useRegisterHelp(settingsHelpContent);
  const { tab, focus } = Route.useSearch();
  const navigate = useNavigate();
  // ?focus=invite implies the Organization tab — flip there before the
  // section gets a chance to autofocus, so the invite input is visible.
  const effectiveTab = focus === "invite" ? "organization" : (tab ?? "user");
  return (
    <div className="px-6 py-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
          profile · organization
        </p>
      </div>

      <Tabs
        value={effectiveTab}
        onValueChange={(v) =>
          navigate({
            to: "/settings",
            search: { tab: v === "user" ? undefined : (v as (typeof SETTINGS_TABS)[number]) },
          })
        }
        className="space-y-5"
      >
        <TabsList>
          <TabsTrigger value="user">User</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="prompts">Prompts</TabsTrigger>
        </TabsList>

        <TabsContent value="user" className="space-y-5">
          <UserTab />
          <CoachPersonaSection />
          <UserSystemPromptSection />
        </TabsContent>

        <TabsContent value="organization" className="space-y-5">
          <OrgSettingsSection autofocus={focus === "invite" ? "invite" : undefined} />
          <JoinLinksSection />
          <DomainVerificationSection />
          <MembersQuotasSection />
          <AllUsersSection />
          <StageProbabilitiesSection />
          <AuditLogSection />
        </TabsContent>

        <TabsContent value="prompts" className="space-y-5">
          <PromptsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UserTab() {
  const qc = useQueryClient();
  const meFn = useServerFn(getMe);
  const updateFn = useServerFn(updateProfile);

  const me = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const { orgsQ, org: currentOrg } = useCurrentOrg();

  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  // Empty/null in DB = inherit org. The Select needs a non-empty value, so
  // we use a sentinel and translate it on save.
  const [methodology, setMethodology] = useState<string>(USER_METHODOLOGY_INHERIT);
  useEffect(() => {
    if (me.data?.profile) {
      setFullName(me.data.profile.full_name ?? "");
      setTitle(me.data.profile.title ?? "");
      const stored = (me.data.profile as { sales_methodology?: string | null }).sales_methodology;
      setMethodology(stored ?? USER_METHODOLOGY_INHERIT);
    }
  }, [me.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          full_name: fullName,
          title,
          sales_methodology:
            methodology === USER_METHODOLOGY_INHERIT ? null : (methodology as MethodologyKey),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Card className="border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Profile</h2>
        <div className="flex gap-1">
          {(me.data?.roles ?? []).map((r) => (
            <Badge key={r} variant="outline" className="font-mono text-[10px] uppercase">
              {r}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border bg-muted/30">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Organization
          </div>
          <div className="text-sm truncate">
            {orgsQ.isLoading ? "Loading…" : currentOrg ? currentOrg.name : "Not in an organization"}
          </div>
        </div>
        {currentOrg && (
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">
            Manage on Organization tab
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Full name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Account Executive"
          />
        </div>
      </div>

      <div>
        <Label>Email</Label>
        <Input value={me.data?.profile?.email ?? ""} readOnly disabled />
        <p className="text-xs text-muted-foreground mt-1.5">
          The address you sign in with. Contact an admin to change it.
        </p>
      </div>

      <div>
        <Label>Sales methodology</Label>
        <Select value={methodology} onValueChange={setMethodology}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={USER_METHODOLOGY_INHERIT}>Use organization default</SelectItem>
            {METHODOLOGY_KEYS.map((k) => (
              <SelectItem key={k} value={k}>
                {METHODOLOGIES[k].name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1.5">
          {methodology === USER_METHODOLOGY_INHERIT
            ? "Follows whatever your organization is set to."
            : METHODOLOGIES[methodology as MethodologyKey].tagline}
        </p>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          Save changes
        </Button>
      </div>

      <ShortcutHintsRow />
      <RestartTourRow />
      <RestartOnboardingRow />
    </Card>
  );
}

const authedRoute = getRouteApi("/_authenticated");

function RestartOnboardingRow() {
  const { session } = authedRoute.useRouteContext();
  return (
    <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-semibold">Replay onboarding</div>
        <p className="text-xs text-muted-foreground">
          Re-pick your coach and run through the intro conversation again, as if it were your first
          day. Useful if you skipped through too fast or just want to meet a different coach.
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          resetAllOnboarding(session.userId);
          window.location.assign("/onboarding/coach");
        }}
      >
        <RotateCcw className="size-3.5" />
        Restart onboarding
      </Button>
    </div>
  );
}

function UserSystemPromptSection() {
  const qc = useQueryClient();
  const meFn = useServerFn(getMe);
  const updateFn = useServerFn(updateProfile);
  const me = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const stored =
    (me.data?.profile as { system_prompt?: string | null } | null)?.system_prompt ?? "";

  const [systemPrompt, setSystemPrompt] = useState("");
  useEffect(() => {
    setSystemPrompt(stored);
  }, [stored]);

  const saveMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          system_prompt: systemPrompt.trim() ? systemPrompt : null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Personal AI prompt saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Card className="border-border p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">How you like to work</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Free-form notes the copilot uses to tailor how it talks to you and how it works with you.
          Layered on top of the org-wide AI prompt and (if set) your coach persona — Crema's base
          scope and safety rules still win. Think communication style ("answer in bullets, no
          preamble"), constraints ("I'm dyslexic — keep sentences short"), or working preferences
          ("flag anything that involves discounting over 15%"). Leave blank to skip.
        </p>
      </div>
      <Textarea
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value.slice(0, USER_SYSTEM_PROMPT_MAX))}
        placeholder="e.g. I prefer concise replies. Don't congratulate me — just tell me the next move."
        rows={6}
        className="font-mono text-xs"
      />
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {systemPrompt.length} / {USER_SYSTEM_PROMPT_MAX}
        </span>
        <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          Save personal prompt
        </Button>
      </div>
    </Card>
  );
}

function ShortcutHintsRow() {
  const { visible, setVisible } = useShortcutHints();
  return (
    <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-semibold">Keyboard shortcut hints</div>
        <p className="text-xs text-muted-foreground">
          Show the little key badges (like{" "}
          <kbd className="font-mono px-1 rounded border border-border bg-background">F</kbd> or{" "}
          <kbd className="font-mono px-1 rounded border border-border bg-background">⌘K</kbd>) next
          to buttons and sidebar links so you can learn the shortcuts without opening the cheat
          sheet. Press{" "}
          <kbd className="font-mono px-1 rounded border border-border bg-background">⌘/</kbd> any
          time to see the full list.
        </p>
      </div>
      <Switch
        checked={visible}
        onCheckedChange={setVisible}
        aria-label="Toggle keyboard shortcut hints"
        className="data-[state=checked]:bg-[#c9885a]"
      />
    </div>
  );
}

function RestartTourRow() {
  const { startTour } = useTour();
  return (
    <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-semibold">Interface tour</div>
        <p className="text-xs text-muted-foreground">
          A 60-second walkthrough of the workspace. Helpful if you're new or showing someone around.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={startTour}>
        <Wand2 className="size-3.5" />
        Restart tour
      </Button>
    </div>
  );
}
