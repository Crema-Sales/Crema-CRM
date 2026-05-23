import { renderEmail, renderEmailText, type EmailLayoutOpts } from "../template";

export interface PasswordResetEmailOpts {
  /** Display name. May be null — we fall back to "there". */
  fullName: string | null;
  /** Full reset link, e.g. https://app.example.com/reset-password/<token>. Pre-built by caller. */
  resetUrl: string;
  /**
   * "self" when the user requested it from the forgot-password flow themselves;
   * "admin" when an org admin triggered it from Settings. Affects copy so the
   * recipient knows whether to be surprised by the email landing in their inbox.
   */
  kind?: "self" | "admin";
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function passwordResetEmail(opts: PasswordResetEmailOpts): RenderedEmail {
  const name = (opts.fullName ?? "").trim() || "there";
  const kind = opts.kind ?? "self";

  const layout: EmailLayoutOpts =
    kind === "self"
      ? {
          previewText: "Reset your Crema password — link expires in 1 hour.",
          heading: `Reset your Crema password, ${name}.`,
          body: `
            <p style="margin:0 0 16px 0">We got a request to reset the password on your Crema account.</p>
            <p style="margin:0 0 16px 0">Tap the button below to choose a new one. The link expires in 1 hour and can only be used once.</p>
            <p style="margin:0">If you didn't ask for this, you can ignore this email — your current password keeps working.</p>
          `,
          cta: { label: "Reset password", url: opts.resetUrl },
          footerNote: "This link expires in 1 hour. We'll never ask for your password by email.",
        }
      : {
          previewText: "An admin asked us to send you a password reset link.",
          heading: `Reset your Crema password, ${name}.`,
          body: `
            <p style="margin:0 0 16px 0">An admin on your Crema organization sent you a password reset link.</p>
            <p style="margin:0 0 16px 0">Tap the button below to choose a new password. The link expires in 1 hour and can only be used once.</p>
            <p style="margin:0">If this looks wrong, check with your admin before clicking.</p>
          `,
          cta: { label: "Reset password", url: opts.resetUrl },
          footerNote: "This link expires in 1 hour. We'll never ask for your password by email.",
        };

  return {
    subject: "Reset your Crema password",
    html: renderEmail(layout),
    text: renderEmailText(layout),
  };
}
