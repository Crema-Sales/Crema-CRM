import { createFileRoute, Link } from "@tanstack/react-router";
import { Coffee } from "lucide-react";
import { consumeVerificationToken, type ConsumeResult } from "@/auth/email-server-fns";

export const Route = createFileRoute("/verify-email/$token")({
  loader: async ({ params }): Promise<ConsumeResult> => {
    return await consumeVerificationToken({ data: { token: params.token } });
  },
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const result = Route.useLoaderData();

  if (result.ok) {
    const headline =
      result.kind === "change" ? "New email confirmed." : "Email confirmed.";
    const body =
      result.kind === "change"
        ? `${result.email} is now the primary address on your Crema account. The previous address has been retired.`
        : `${result.email} is verified. You're all set.`;
    return (
      <Centered>
        <Wordmark />
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Verified
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{headline}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
        <div className="flex gap-3 justify-center pt-2">
          <Link
            to="/funnel"
            className="px-4 py-2.5 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 transition-colors"
          >
            Go to dashboard
          </Link>
          <Link
            to="/marketing"
            className="px-4 py-2.5 border border-border rounded-lg text-sm font-bold hover:bg-muted transition-colors"
          >
            Back home
          </Link>
        </div>
      </Centered>
    );
  }

  const errCopy: Record<typeof result.reason, { headline: string; body: string }> = {
    invalid: {
      headline: "Link not recognized.",
      body: "This verification link is no longer valid. Open Crema and request a new one from settings.",
    },
    already_used: {
      headline: "Already confirmed.",
      body: "This email has already been verified. Nothing to do — sign in and carry on.",
    },
    expired: {
      headline: "Link expired.",
      body: "Verification links expire after 24 hours. Open Crema and resend a fresh one from settings.",
    },
    stale: {
      headline: "Out of date.",
      body: "Your account email changed since this link was sent. Use the most recent confirmation email instead.",
    },
  };
  const copy = errCopy[result.reason];

  return (
    <Centered>
      <Wordmark />
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Verification
      </p>
      <h1 className="text-2xl font-bold tracking-tight">{copy.headline}</h1>
      <p className="text-sm text-muted-foreground">{copy.body}</p>
      <div className="flex gap-3 justify-center pt-2">
        <Link
          to="/login"
          className="px-4 py-2.5 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 transition-colors"
        >
          Sign in
        </Link>
        <Link
          to="/marketing"
          className="px-4 py-2.5 border border-border rounded-lg text-sm font-bold hover:bg-muted transition-colors"
        >
          Back home
        </Link>
      </div>
    </Centered>
  );
}

function Wordmark() {
  return (
    <p className="inline-flex items-center gap-2 text-3xl font-bold tracking-tight pb-2">
      <Coffee className="size-7 shrink-0" style={{ color: "#c9885a" }} />
      Crema<span style={{ color: "#c9885a" }}>.</span>
    </p>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-3 text-center">{children}</div>
    </div>
  );
}
