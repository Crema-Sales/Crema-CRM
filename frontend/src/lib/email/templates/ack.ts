import { renderEmail, renderEmailText, escapeForBody, type EmailLayoutOpts } from "../template";
import type { RenderedEmail } from "./verification";

export interface AckEmailOpts {
  /** Submitter's name, if the form captured one. Falls back to "there". */
  fullName: string | null;
  /** Display name of the org running the tracker (e.g. "Crema", "Acme Coffee Roasters"). */
  orgName: string;
  /** Phase 05 wires this to /unsubscribe/$token?c=ack. */
  unsubscribeUrl: string;
}

export function ackEmail(opts: AckEmailOpts): RenderedEmail {
  const name = (opts.fullName ?? "").trim() || "there";
  const orgName = opts.orgName.trim() || "the team";

  const layout: EmailLayoutOpts = {
    previewText: `Thanks for reaching out to ${orgName}.`,
    heading: `Thanks, ${name}.`,
    body: `
      <p style="margin:0 0 16px 0">We got your message and <strong>${escapeForBody(orgName)}</strong> will follow up shortly.</p>
      <p style="margin:0">You're receiving this because you submitted a form on a site running the Crema tracker. We send one confirmation per form, then stay out of your inbox.</p>
    `,
    footerNote: `Sent by ${orgName} via Crema.`,
    unsubscribeUrl: opts.unsubscribeUrl,
  };

  return {
    subject: `Thanks for reaching out to ${orgName}`,
    html: renderEmail(layout),
    text: renderEmailText(layout),
  };
}
