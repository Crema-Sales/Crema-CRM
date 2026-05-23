import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useTour } from "./tour-context";
import { hasSeenIntroConversation } from "@/lib/onboarding-flags";

/**
 * Triggers the welcome prompt on a user's first visit to /today — the
 * landing page after onboarding (sign-up → coach picker → /today).
 * localStorage persistence in TourProvider keeps this idempotent across
 * sessions, so it fires once and never nags a returning user.
 *
 * First-time users instead get the tour offered at the end of the
 * conversational intro (see OnboardingConversation), so this standalone
 * prompt stays out of the way until that flow has run on this browser.
 */
export function TourAutoStart({ userId }: { userId: string }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { promptIfFirstVisit } = useTour();

  useEffect(() => {
    if (pathname !== "/today") return;
    if (!hasSeenIntroConversation(userId)) return;
    promptIfFirstVisit();
  }, [pathname, promptIfFirstVisit, userId]);

  return null;
}
