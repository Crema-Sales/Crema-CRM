import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { completePasswordReset, peekPasswordResetToken } from "@/auth/password-reset-fns";

export const Route = createFileRoute("/reset-password/$token")({
  loader: async ({ params }) => {
    return await peekPasswordResetToken({ data: { token: params.token } });
  },
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = Route.useParams();
  const preview = Route.useLoaderData();
  const navigate = useNavigate();
  const completeFn = useServerFn(completePasswordReset);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  if (!preview.ok) {
    const message =
      preview.reason === "expired"
        ? "This reset link has expired."
        : preview.reason === "used"
          ? "This reset link has already been used."
          : "This reset link is invalid.";
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Link no longer valid</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <button
          onClick={() => navigate({ to: "/login" })}
          className="w-full px-4 py-2.5 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 transition-colors"
        >
          Back to sign in
        </button>
      </Centered>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      await completeFn({ data: { token, password } });
      toast.success("Password updated. Sign in with your new password.");
      await navigate({ to: "/login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Centered>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Reset password
      </p>
      <h1 className="text-2xl font-bold tracking-tight">Pick a new password</h1>
      <p className="text-sm text-muted-foreground">
        For <span className="font-mono">{preview.email}</span>.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3 text-left">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          required
          minLength={6}
          className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          required
          minLength={6}
          className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2.5 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 disabled:opacity-50 transition-colors"
        >
          {loading ? "..." : "Update password"}
        </button>
      </form>
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
