import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getSession } from "@/auth/server-fns";
import { consumeJoinLink, previewJoinLink } from "@/auth/join-links-fns";

export const Route = createFileRoute("/invite-link/$token")({
  beforeLoad: async ({ params }) => {
    const session = await getSession();
    if (!session) {
      // Stash the token so login can resume consumption after sign-in.
      throw redirect({
        to: "/login",
        search: { joinLink: params.token } as never,
      });
    }
  },
  loader: async ({ params }) => {
    return await previewJoinLink({ data: { token: params.token } });
  },
  component: JoinLinkPage,
});

const REASON_LABELS: Record<string, string> = {
  not_found: "This invite link doesn't exist.",
  revoked: "This invite link has been revoked.",
  expired: "This invite link has expired.",
  exhausted: "This invite link has hit its usage limit.",
};

function JoinLinkPage() {
  const { token } = Route.useParams();
  const preview = Route.useLoaderData();
  const navigate = useNavigate();
  const consumeFn = useServerFn(consumeJoinLink);
  const [loading, setLoading] = useState(false);

  if (!preview.ok) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Invite link unavailable</h1>
        <p className="text-sm text-muted-foreground">
          {REASON_LABELS[preview.reason] ??
            "This invite link is no longer valid."}{" "}
          Ask the person who shared it for a fresh one.
        </p>
      </Centered>
    );
  }

  const handleAccept = async () => {
    setLoading(true);
    try {
      const res = await consumeFn({ data: { token } });
      toast.success(
        res.already_member
          ? `You're already a member of ${preview.org.name}`
          : `Joined ${preview.org.name}`,
      );
      await navigate({ to: "/funnel" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to join");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Centered>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        You're invited
      </p>
      <h1 className="text-2xl font-bold tracking-tight">{preview.org.name}</h1>
      <p className="text-sm text-muted-foreground">
        {preview.uses_remaining !== null && (
          <>
            {preview.uses_remaining}{" "}
            {preview.uses_remaining === 1 ? "spot" : "spots"} left
          </>
        )}
        {preview.uses_remaining !== null && preview.expires_at && " · "}
        {preview.expires_at && (
          <>expires {new Date(preview.expires_at).toLocaleDateString()}</>
        )}
      </p>
      <button
        onClick={handleAccept}
        disabled={loading}
        className="w-full px-4 py-2.5 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 disabled:opacity-50 transition-colors"
      >
        {loading ? "..." : `Join ${preview.org.name}`}
      </button>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 text-center">{children}</div>
    </div>
  );
}
