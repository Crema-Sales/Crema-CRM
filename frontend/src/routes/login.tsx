import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Coffee } from "lucide-react";
import { getSession, signIn, signUp } from "@/auth/server-fns";
import { requestPasswordReset } from "@/auth/password-reset-fns";
import { hasSeenCoachOnboarding } from "@/lib/onboarding-flags";
import { toast } from "sonner";
import loginSteamVideo from "@/assets/login-steam.mp4";

const loginSearchSchema = z.object({
  // Where to land after a successful sign-in; set by the _authenticated
  // guard when it bounces an unauthenticated visitor here.
  redirect: z.string().optional(),
  // Which form to open on. Lets callers (e.g. the marketing hero) deep-link
  // straight to the sign-up form instead of the default sign-in.
  mode: z.enum(["signin", "signup"]).optional(),
});

// Only honor same-origin, root-relative paths. Rejects protocol-relative
// ("//evil", "/\evil") and absolute URLs so the param can't be used as an
// open redirect.
function safeRedirect(target: string | undefined): string {
  return target && /^\/(?![/\\])/.test(target) ? target : "/today";
}

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  beforeLoad: async ({ search }) => {
    const session = await getSession();
    if (session) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo, mode: initialMode } = Route.useSearch();
  const dest = safeRedirect(redirectTo);
  const signInFn = useServerFn(signIn);
  const signUpFn = useServerFn(signUp);
  const resetReqFn = useServerFn(requestPasswordReset);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        await signUpFn({ data: { email, password, full_name: name } });
        // New accounts go through onboarding (coach picker → tour) rather than
        // straight to `dest` — that's how a first-time user gets both steps.
        await navigate({ to: "/onboarding/coach" });
      } else if (mode === "forgot") {
        await resetReqFn({ data: { email } });
        setResetSent(true);
      } else {
        const user = await signInFn({ data: { email, password } });
        // First sign-in for this account on this browser → replay onboarding
        // (coach picker → tour) even for an existing user. The "seen" flag is
        // browser-local, so the same account on a fresh browser re-onboards;
        // a returning visitor on a known browser goes straight to `dest`.
        if (hasSeenCoachOnboarding(user.id)) {
          await navigate({ href: dest });
        } else {
          await navigate({ to: "/onboarding/coach" });
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 text-background relative overflow-hidden" style={{ backgroundColor: "#1a0f08" }}>
        <video
          src={loginSteamVideo}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
        <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "32px 32px" }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 40%, rgba(20,10,5,0.6) 100%)" }} />
        <div className="relative flex items-center gap-3 group">
          <Coffee className="size-10 shrink-0" style={{ color: "#c9885a" }} />
          <span className="text-5xl font-bold tracking-tight">
            Crema<span style={{ color: "#c9885a" }}>.</span>
          </span>
        </div>
        <div className="relative space-y-6" style={{ transform: "translateY(-200px)" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#c9885a" }}>AI-native Sales CRM</p>
          <h1 className="font-bold tracking-tight text-balance leading-tight max-w-md text-5xl">
            Coffee is for closers.
          </h1>
          <p className="text-sm text-background/60 max-w-md leading-relaxed">
            Pipeline intelligence, prioritized work, and AI-drafted follow-ups, without the legacy enterprise weight.
          </p>
        </div>
        <p className="relative text-[10px] font-mono uppercase tracking-widest text-background/40">v1.0 · Crema Sales</p>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password"}
            </p>
            <h2 className="text-2xl font-bold tracking-tight">
              {mode === "forgot" ? "Forgot your password?" : "Welcome to Crema"}
            </h2>
            {mode === "forgot" && !resetSent && (
              <p className="text-xs text-muted-foreground pt-1">
                Enter your account email and we'll send you a link to choose a new password.
              </p>
            )}
          </div>

          {mode === "forgot" && resetSent ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg border border-border bg-muted/40 text-sm">
                If <span className="font-mono">{email}</span> has a Crema account, a reset
                link is on its way. The link expires in 1 hour.
              </div>
              <button
                onClick={() => {
                  setMode("signin");
                  setResetSent(false);
                  setPassword("");
                }}
                className="w-full px-4 py-2.5 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 transition-colors"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "signup" && (
                <div className="space-y-1">
                  <label htmlFor="login-name" className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Full name
                  </label>
                  <input id="login-name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" required className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              )}
              <div className="space-y-1">
                <label htmlFor="login-email" className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Email
                </label>
                <input id="login-email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              {mode !== "forgot" && (
                <div className="space-y-1">
                  <label htmlFor="login-password" className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Password
                  </label>
                  <input id="login-password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              )}
              {mode === "signin" && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setResetSent(false);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
              <button
                type="submit"
                disabled={
                  loading ||
                  !email.trim() ||
                  (mode !== "forgot" && password.length < 6) ||
                  (mode === "signup" && !name.trim())
                }
                className="w-full px-4 py-2.5 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "..." : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
              </button>
            </form>
          )}

          {!(mode === "forgot" && resetSent) && (
            <p className="text-xs text-muted-foreground text-center">
              {mode === "signin" && (
                <>
                  New to Crema?{" "}
                  <button onClick={() => setMode("signup")} className="text-primary font-semibold hover:underline">
                    Create an account
                  </button>
                </>
              )}
              {mode === "signup" && (
                <>
                  Already have an account?{" "}
                  <button onClick={() => setMode("signin")} className="text-primary font-semibold hover:underline">
                    Sign in
                  </button>
                </>
              )}
              {mode === "forgot" && (
                <>
                  Remembered it?{" "}
                  <button onClick={() => setMode("signin")} className="text-primary font-semibold hover:underline">
                    Sign in
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
