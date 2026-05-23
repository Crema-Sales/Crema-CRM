import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Coffee, Loader2, CheckCircle2, AlertTriangle, Puzzle, PowerOff } from "lucide-react";
import { getAgentToken } from "@/lib/agent-token-fns";
import { EXTENSION_ID, agentBaseUrl } from "@/lib/extension";

// The extension's service worker opens this page on first install
// (`extension/src/background/index.ts` → `DEFAULT_ONBOARD_URL`). `install_id`
// is a per-install UUID the extension mints; we don't consume it server-side
// yet, but we echo it into the login redirect so the round-trip is lossless.
const onboardSearchSchema = z.object({
  install_id: z.string().optional(),
});

export const Route = createFileRoute("/extension/onboard")({
  validateSearch: onboardSearchSchema,
  component: ExtensionOnboardPage,
});

// One step of the handshake outcome. `no-extension` covers both "not a
// Chromium browser" and "extension not installed / not reachable" — from the
// page's side those are indistinguishable (sendMessage just never connects).
// `paired-off` means the handshake stored credentials but the rep's master
// switch (the coffee-cup popup toggle) is OFF — the agent can't drive the
// browser until the rep flips it ON. `verifying` runs after a clean handshake
// to confirm the extension's WebSocket actually reached the backend DO before
// declaring victory — without it, success was a lie whenever the WS dial
// silently failed.
type HandshakeState =
  | { kind: "checking" }
  | { kind: "needs-login" }
  | { kind: "handshaking" }
  | { kind: "verifying"; email: string }
  | { kind: "success"; email: string }
  | { kind: "paired-off"; email: string }
  | { kind: "no-extension" }
  | { kind: "not-online"; email: string }
  | { kind: "error"; code: string };

// The extension's handshake reply now carries the master-switch state so we
// can render the paired-but-off branch without a second round-trip. Older
// builds don't include `enabled` — `undefined` means "treat as on" so they
// stay on the legacy happy path.
type HandoffResponse = { ok: true; enabled?: boolean } | { ok: false; error: string };

interface ChromeRuntime {
  sendMessage?: (
    extensionId: string,
    message: unknown,
    callback: (response?: HandoffResponse) => void,
  ) => void;
  lastError?: { message?: string };
}

// `chrome.runtime` is exposed on every page in Chromium browsers (it's how
// `externally_connectable` works); it's absent in Firefox/Safari.
function getChromeRuntime(): ChromeRuntime | null {
  const c = (globalThis as { chrome?: { runtime?: ChromeRuntime } }).chrome;
  return c?.runtime ?? null;
}

type HandshakeOutcome =
  | { kind: "ok"; enabled: boolean }
  | { kind: "no-extension" }
  | { kind: "error"; code: string };

// Resolve once with the handshake outcome. The extension's callback always
// fires, but we still arm a timeout in case the service worker is wedged
// mid-cold-boot so the page never hangs on the spinner.
function sendHandoff(repId: string, jwt: string): Promise<HandshakeOutcome> {
  return new Promise((resolve) => {
    const runtime = getChromeRuntime();
    if (!runtime || typeof runtime.sendMessage !== "function") {
      resolve({ kind: "no-extension" });
      return;
    }
    let settled = false;
    const finish = (s: HandshakeOutcome) => {
      if (settled) return;
      settled = true;
      resolve(s);
    };
    const timer = setTimeout(() => finish({ kind: "no-extension" }), 8000);
    try {
      runtime.sendMessage(
        EXTENSION_ID,
        { type: "agent_handoff", repId, jwt, baseUrl: agentBaseUrl() },
        (resp) => {
          clearTimeout(timer);
          // A missing extension surfaces here as lastError ("Could not
          // establish connection. Receiving end does not exist.").
          if (runtime.lastError) {
            finish({ kind: "no-extension" });
            return;
          }
          if (resp && resp.ok) {
            // Legacy builds without `enabled` → default to true so we don't
            // park a happily-running extension on the paired-off screen.
            finish({ kind: "ok", enabled: resp.enabled !== false });
            return;
          }
          finish({ kind: "error", code: resp?.error ?? "unknown" });
        },
      );
    } catch {
      clearTimeout(timer);
      finish({ kind: "no-extension" });
    }
  });
}

// Maps the extension's `agent_handoff` rejection codes
// (`extension/src/background/index.ts`) to copy a rep can act on.
const ERROR_COPY: Record<string, string> = {
  malformed_repId:
    "Your account ID isn't in the format the extension expects. Contact support so we can take a look.",
  baseUrl_not_allowed:
    "The extension rejected our server address. You're likely on an older build — re-download it from Settings.",
  missing_fields: "We couldn't assemble your credentials. Try signing out and back in.",
  invalid_payload: "The extension rejected the handshake payload. Re-download the latest build from Settings.",
  unknown_type: "Your extension build is out of date. Re-download the latest build from Settings.",
  unknown: "Something went wrong connecting the extension. Try again, or re-download it from Settings.",
};

// The extension dials its WebSocket against this base on receipt of the
// handoff; we poll the backend's matching `/agents/:repId/status` REST
// endpoint to confirm the DO actually saw the socket. Without this check
// the page would declare success on the local handoff even if the WS dial
// failed silently (bad JWT, dead host, firewall) — and the chat assistant
// would then report "extension not connected" minutes later.
async function fetchOnline(
  baseUrl: string,
  jwt: string,
  repId: string,
  signal: AbortSignal,
): Promise<{ online: boolean; enabled: boolean } | null> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/agents/${encodeURIComponent(repId)}/status`, {
      headers: { Authorization: `Bearer ${jwt}` },
      signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { online?: boolean; enabled?: boolean };
    return { online: body.online === true, enabled: body.enabled === true };
  } catch {
    return null;
  }
}

// Wait up to ~6s (12 × 500ms) for the WS to register at the DO. The extension
// fires `socket.connect()` immediately on handoff but the open-frame round
// trip can take 1–2s on a cold service worker; we want to be patient enough
// to hide that hiccup, fast enough that a real failure shows the diagnostic.
async function waitForOnline(
  baseUrl: string,
  jwt: string,
  repId: string,
  signal: AbortSignal,
): Promise<boolean> {
  for (let i = 0; i < 12; i += 1) {
    if (signal.aborted) return false;
    const status = await fetchOnline(baseUrl, jwt, repId, signal);
    if (status?.online) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function ExtensionOnboardPage() {
  const { install_id } = Route.useSearch();
  const getToken = useServerFn(getAgentToken);
  const [state, setState] = useState<HandshakeState>({ kind: "checking" });

  const run = useCallback(async () => {
    setState({ kind: "checking" });
    let token: Awaited<ReturnType<typeof getAgentToken>>;
    try {
      token = await getToken();
    } catch {
      setState({ kind: "error", code: "unknown" });
      return;
    }
    if (!token.token || !token.repId) {
      setState({ kind: "needs-login" });
      return;
    }
    setState({ kind: "handshaking" });
    const result = await sendHandoff(token.repId, token.token);
    if (result.kind === "no-extension") {
      setState({ kind: "no-extension" });
      return;
    }
    if (result.kind === "error") {
      setState({ kind: "error", code: result.code });
      return;
    }

    const email = token.email ?? "";
    if (!result.enabled) {
      // Credentials are linked but the rep has the master switch off. We
      // don't wait for the WS to come online — the extension can choose to
      // hold off dialing when disabled, and even if it does dial, the chat
      // assistant will refuse to drive until the switch flips.
      setState({ kind: "paired-off", email });
      return;
    }

    setState({ kind: "verifying", email });
    const controller = new AbortController();
    const online = await waitForOnline(agentBaseUrl(), token.token, token.repId, controller.signal);
    setState(online ? { kind: "success", email } : { kind: "not-online", email });
  }, [getToken]);

  useEffect(() => {
    void run();
  }, [run]);

  // Round-trip target so login bounces back here (with install_id intact).
  // `safeRedirect` in the login route only honors root-relative paths.
  const redirectTarget =
    "/extension/onboard" +
    (install_id ? `?install_id=${encodeURIComponent(install_id)}` : "");

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-5 text-center">
        <p className="inline-flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Coffee className="size-7 shrink-0" style={{ color: "#c9885a" }} />
          Crema<span style={{ color: "#c9885a" }}>.</span>
        </p>

        {(state.kind === "checking" ||
          state.kind === "handshaking" ||
          state.kind === "verifying") && (
          <>
            <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Connecting your extension</h1>
            <p className="text-sm text-muted-foreground">
              {state.kind === "checking"
                ? "Checking your session…"
                : state.kind === "handshaking"
                  ? "Handing your credentials to the Crema extension…"
                  : "Waiting for the extension to phone home…"}
            </p>
          </>
        )}

        {state.kind === "needs-login" && (
          <>
            <Puzzle className="mx-auto size-8" style={{ color: "#c9885a" }} />
            <h1 className="text-2xl font-bold tracking-tight">Sign in to finish setup</h1>
            <p className="text-sm text-muted-foreground">
              The Crema extension is installed. Sign in and we'll connect it to your
              account automatically.
            </p>
            <div className="pt-1">
              <Link
                to="/login"
                search={{ redirect: redirectTarget, mode: "signin" }}
                className="inline-block px-4 py-2.5 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 transition-colors"
              >
                Sign in to Crema
              </Link>
            </div>
          </>
        )}

        {state.kind === "success" && (
          <>
            <CheckCircle2 className="mx-auto size-8 text-emerald-600" />
            <h1 className="text-2xl font-bold tracking-tight">Extension connected</h1>
            <p className="text-sm text-muted-foreground">
              {state.email ? (
                <>
                  Linked to <span className="font-mono">{state.email}</span>. The Crema icon
                  in your toolbar is live — click it any time to pause the agent.
                </>
              ) : (
                "The Crema icon in your toolbar is live — click it any time to pause the agent."
              )}
            </p>
            <div className="flex gap-3 justify-center pt-1">
              <Link
                to="/today"
                className="px-4 py-2.5 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 transition-colors"
              >
                Go to Crema
              </Link>
            </div>
          </>
        )}

        {state.kind === "paired-off" && (
          <>
            <PowerOff className="mx-auto size-8" style={{ color: "#c9885a" }} />
            <h1 className="text-2xl font-bold tracking-tight">Paired — but switched off</h1>
            <p className="text-sm text-muted-foreground">
              Your account is linked
              {state.email ? (
                <>
                  {" "}to <span className="font-mono">{state.email}</span>
                </>
              ) : null}
              . The Crema extension is in <strong>OFF</strong> mode, so I can't drive your
              browser yet. Click the coffee-cup icon in your toolbar and toggle it to{" "}
              <strong>ON</strong> when you want me to take over — toggle it back OFF when
              you want to be in the driver's seat.
            </p>
            <div className="flex gap-3 justify-center pt-1">
              <button
                type="button"
                onClick={() => void run()}
                className="px-4 py-2.5 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 transition-colors"
              >
                I flipped it on
              </button>
              <Link
                to="/today"
                className="px-4 py-2.5 border border-border rounded-lg text-sm font-bold hover:bg-muted transition-colors"
              >
                Go to Crema
              </Link>
            </div>
          </>
        )}

        {state.kind === "no-extension" && (
          <>
            <AlertTriangle className="mx-auto size-8 text-amber-500" />
            <h1 className="text-2xl font-bold tracking-tight">Couldn't reach the extension</h1>
            <p className="text-sm text-muted-foreground">
              We couldn't talk to the Crema extension from this tab. Make sure it's installed
              and enabled in <code className="font-mono">chrome://extensions</code>, then
              reload. The extension only works in Chrome, Brave, and Arc.
            </p>
            <div className="flex gap-3 justify-center pt-1">
              <button
                type="button"
                onClick={() => void run()}
                className="px-4 py-2.5 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 transition-colors"
              >
                Try again
              </button>
              <Link
                to="/settings"
                className="px-4 py-2.5 border border-border rounded-lg text-sm font-bold hover:bg-muted transition-colors"
              >
                Install instructions
              </Link>
            </div>
          </>
        )}

        {state.kind === "not-online" && (
          <>
            <AlertTriangle className="mx-auto size-8 text-amber-500" />
            <h1 className="text-2xl font-bold tracking-tight">Almost there</h1>
            <p className="text-sm text-muted-foreground">
              The extension accepted your credentials but hasn't phoned home yet. This
              usually clears in a few seconds — try again. If it sticks, reload
              <code className="font-mono"> chrome://extensions</code> and re-download the
              latest build from Settings.
            </p>
            <div className="flex gap-3 justify-center pt-1">
              <button
                type="button"
                onClick={() => void run()}
                className="px-4 py-2.5 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 transition-colors"
              >
                Try again
              </button>
              <Link
                to="/settings"
                className="px-4 py-2.5 border border-border rounded-lg text-sm font-bold hover:bg-muted transition-colors"
              >
                Open Settings
              </Link>
            </div>
          </>
        )}

        {state.kind === "error" && (
          <>
            <AlertTriangle className="mx-auto size-8 text-destructive" />
            <h1 className="text-2xl font-bold tracking-tight">Handshake failed</h1>
            <p className="text-sm text-muted-foreground">
              {ERROR_COPY[state.code] ?? ERROR_COPY.unknown}
            </p>
            <div className="flex gap-3 justify-center pt-1">
              <button
                type="button"
                onClick={() => void run()}
                className="px-4 py-2.5 bg-foreground text-background rounded-lg text-sm font-bold hover:bg-foreground/90 transition-colors"
              >
                Try again
              </button>
              <Link
                to="/settings"
                className="px-4 py-2.5 border border-border rounded-lg text-sm font-bold hover:bg-muted transition-colors"
              >
                Open Settings
              </Link>
            </div>
          </>
        )}

        {install_id && (
          <p className="pt-2 text-[10px] font-mono text-muted-foreground/60">
            install {install_id}
          </p>
        )}
      </div>
    </div>
  );
}
