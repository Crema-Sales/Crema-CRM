import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getSession } from "@/auth/server-fns";
import { acceptOrgInvitation, previewInvitation } from "@/auth/org-fns";

export const Route = createFileRoute("/invite/$token")({
  beforeLoad: async ({ params }) => {
    const session = await getSession();
    if (!session) {
      // Stash the token so login can complete the acceptance.
      throw redirect({ to: "/login", search: { invite: params.token } as never });
    }
  },
  loader: async ({ params }) => {
    return await previewInvitation({ data: { token: params.token } });
  },
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const preview = Route.useLoaderData();
  const navigate = useNavigate();
  const acceptFn = useServerFn(acceptOrgInvitation);
  const [loading, setLoading] = useState(false);

  if (!preview.ok) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Invitation not found</h1>
        <p className="text-sm text-muted-foreground">
          This link is no longer valid. Ask your teammate to send a fresh invitation.
        </p>
      </Centered>
    );
  }

  const handleAccept = async () => {
    setLoading(true);
    try {
      await acceptFn({ data: { token } });
      toast.success(`Joined ${preview.org.name}`);
      await navigate({ to: "/funnel" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to accept");
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
        Invitation sent to <span className="font-mono">{preview.email}</span>.
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
