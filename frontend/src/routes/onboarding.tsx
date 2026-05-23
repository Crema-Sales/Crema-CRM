import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Coffee } from "lucide-react";
import { getSession } from "@/auth/server-fns";
import { createOrg, acceptOrgInvitation, listMyOrgs } from "@/auth/org-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async ({ location }) => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
    // If they already belong to an org, skip ahead to the optional coach
    // picker. The picker has its own session check and bounces stale URLs
    // back here if the user somehow lost their org membership.
    const { orgs } = await listMyOrgs();
    if (orgs.length > 0 && location.pathname !== "/onboarding/coach") {
      throw redirect({ to: "/onboarding/coach" });
    }
  },
  component: OnboardingPage,
});

// Map raw server errors into messages a new user can act on. We log the raw
// text so devtools / Sentry still see it; we just don't dump SQLITE_ERROR
// strings into the onboarding UI of someone signing up for the first time.
function friendlyOnboardingError(raw: string): string {
  if (/D1_ERROR|SQLITE|no such table|no such column/i.test(raw)) {
    return "We couldn't finish setting up your workspace. Our team has been alerted — please try again in a minute.";
  }
  if (/network|fetch failed|load failed/i.test(raw)) {
    return "Network hiccup. Check your connection and try again.";
  }
  return raw;
}

function OnboardingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const createFn = useServerFn(createOrg);
  const acceptFn = useServerFn(acceptOrgInvitation);
  const [mode, setMode] = useState<"create" | "invite">("create");
  const [orgName, setOrgName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (location.pathname !== "/onboarding") {
    return <Outlet />;
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createFn({ data: { name: orgName, logo_url: logoUrl.trim() || null } });
      toast.success("Organization created");
      await navigate({ to: "/onboarding/coach" });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Failed to create organization";
      console.error("[onboarding] createOrg failed", err);
      const friendly = friendlyOnboardingError(raw);
      setError(friendly);
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await acceptFn({ data: { token: token.trim() } });
      toast.success("Joined organization");
      await navigate({ to: "/onboarding/coach" });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Failed to accept invitation";
      console.error("[onboarding] acceptInvitation failed", err);
      const friendly = friendlyOnboardingError(raw);
      setError(friendly);
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-2 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Step one
          </p>
          <h1 className="inline-flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Coffee className="size-7 shrink-0" style={{ color: "#c9885a" }} />
            Crema<span style={{ color: "#c9885a" }}>.</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Create a new organization or accept an invitation to continue.
          </p>
        </div>

        <div className="flex gap-2 border border-border rounded-lg p-1 bg-muted/30">
          <button
            type="button"
            onClick={() => {
              setMode("create");
              setError(null);
            }}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === "create" ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            Create organization
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("invite");
              setError(null);
            }}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === "invite" ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            Accept invitation
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        {mode === "create" ? (
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Organization name"
              required
              maxLength={120}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="Logo URL (optional)"
              maxLength={500}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="submit"
              disabled={loading || orgName.trim().length === 0}
              className="w-full px-4 py-2.5 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "..." : "Create organization"}
            </button>
            <p className="text-[11px] text-muted-foreground text-center">
              You'll be the first admin. Invite teammates from Settings after.
            </p>
          </form>
        ) : (
          <form onSubmit={handleAccept} className="space-y-3">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Invitation token"
              required
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="submit"
              disabled={loading || token.trim().length === 0}
              className="w-full px-4 py-2.5 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "..." : "Accept invitation"}
            </button>
            <p className="text-[11px] text-muted-foreground text-center">
              Paste the token from your invitation email, or open the link directly.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
