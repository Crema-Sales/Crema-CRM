import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getSession } from "@/auth/server-fns";
import { listMyOrgs } from "@/auth/org-fns";
import { setMyCoachPersona } from "@/auth/coach-persona-fns";
import { CoachPickerGallery } from "@/components/coach-picker";
import { COACH_PERSONAS_BY_SLUG } from "@/lib/coach-personas";
import { markCoachOnboardingSeen } from "@/lib/onboarding-flags";

export const Route = createFileRoute("/onboarding/coach")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    // Coach picker only makes sense after the user belongs to an org.
    // Stale URLs (anyone landing here without an org) → org-create.
    const { orgs } = await listMyOrgs();
    if (orgs.length === 0) throw redirect({ to: "/onboarding" });
    return { session };
  },
  component: CoachPickerPage,
});

function CoachPickerPage() {
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  const saveFn = useServerFn(setMyCoachPersona);
  const [saving, setSaving] = useState(false);

  // Completing the picker (either way) marks onboarding done for this browser
  // so the next sign-in lands straight on /today.
  const finish = async () => {
    markCoachOnboardingSeen(session.userId);
    await navigate({ to: "/today" });
  };

  const handlePick = async (slug: string) => {
    setSaving(true);
    try {
      await saveFn({ data: { slug } });
      toast.success("Coach picked");
      await finish();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save coach");
      setSaving(false);
    }
  };

  // Skip never writes to the server: a brand-new account is already coach-less
  // by default, and a returning user re-onboarding on a new browser would have
  // their previously-chosen coach wiped if we saved `null` here.
  const handleSkip = () => {
    void finish();
  };

  const currentCoach = session.coach_persona_slug
    ? (COACH_PERSONAS_BY_SLUG[session.coach_persona_slug] ?? null)
    : null;

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="space-y-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Welcome to Crema
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Pick a coach you look up to</h1>
          <p className="mx-auto max-w-xl text-sm text-muted-foreground">
            Your copilot will adopt this voice when it coaches you through deals. You can change or
            clear it any time from settings.
          </p>
        </header>

        {currentCoach ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => handlePick(session.coach_persona_slug!)}
              disabled={saving}
              className="rounded-full bg-foreground px-5 py-2 text-sm font-bold text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
            >
              Continue with {currentCoach.name.split(" ")[0]}
            </button>
          </div>
        ) : null}

        <CoachPickerGallery
          currentSlug={session.coach_persona_slug}
          saving={saving}
          onPick={(slug) => handlePick(slug)}
          onSkip={handleSkip}
        />
      </div>
    </div>
  );
}
