import { renderEmail, renderEmailText, escapeForBody, type EmailLayoutOpts } from "../template";

export interface VerificationEmailOpts {
  /** Display name. May be null for users who signed up without one — we fall back to "there". */
  fullName: string | null;
  /** Full verification link, e.g. https://app.example.com/verify-email/<token>. Pre-built by caller. */
  verifyUrl: string;
  /**
   * Whether this is the first verification on a freshly signed-up account, or
   * the confirmation of a change-email request. The body copy differs slightly:
   * the change-email variant reassures the recipient that the OLD address stays
   * active until they click.
   */
  kind?: "initial" | "change";
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function verificationEmail(opts: VerificationEmailOpts): RenderedEmail {
  const name = (opts.fullName ?? "").trim() || "there";
  const kind = opts.kind ?? "initial";

  const layout: EmailLayoutOpts =
    kind === "initial"
      ? {
          previewText: "Confirm your email and lock in your Crema account.",
          heading: `Welcome to Crema, ${name}.`,
          body: `
            <p style="margin:0 0 16px 0">One quick step before we hand you the keys: confirm this is really your email.</p>
            <p style="margin:0 0 16px 0">Tap the button below — it takes one click and the link expires in 24 hours.</p>
            <p style="margin:0">If you didn't sign up for Crema, ignore this. No account gets activated without confirmation.</p>
          `,
          cta: { label: "Confirm email", url: opts.verifyUrl },
          footerNote: "This link expires in 24 hours. We'll never ask for your password by email.",
        }
      : {
          previewText: "Confirm your new email address for your Crema account.",
          heading: `Confirm your new email, ${name}.`,
          body: `
            <p style="margin:0 0 16px 0">You asked to change the email on your Crema account to <strong>${escapeForBody(extractEmailFromUrl(opts.verifyUrl))}</strong>.</p>
            <p style="margin:0 0 16px 0">Tap the button below to make it official. Your old email keeps working until you click — so if this wasn't you, just ignore this message and nothing changes.</p>
          `,
          cta: { label: "Confirm new email", url: opts.verifyUrl },
          footerNote: "This link expires in 24 hours. Your previous address stays verified until this one is confirmed.",
        };

  return {
    subject: kind === "initial" ? "Confirm your Crema email" : "Confirm your new Crema email",
    html: renderEmail(layout),
    text: renderEmailText(layout),
  };
}

// Best-effort: pulls the recipient address out of the verify URL if the caller
// embedded it as a search param. Pure cosmetic — body copy still reads fine
// without it. We don't accept the email as a separate opt because the verify
// URL is the single source of truth (the token there resolves to the address).
function extractEmailFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.searchParams.get("email") ?? "the new address";
  } catch {
    return "the new address";
  }
}
