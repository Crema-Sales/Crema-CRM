import { renderEmail, renderEmailText, escapeForBody, type EmailLayoutOpts } from "../template";
import type { RenderedEmail } from "./verification";

export interface MailingListAckOpts {
  /** Submitter's name if the form captured one. Falls back to "there". */
  fullName: string | null;
  /** Phase 05 wires this to /unsubscribe/$token?c=marketing. */
  unsubscribeUrl: string;
}

export function mailingListAck(opts: MailingListAckOpts): RenderedEmail {
  const name = (opts.fullName ?? "").trim() || "there";
  const layout: EmailLayoutOpts = {
    previewText: "You're on the Crema list — design diary + early invites incoming.",
    heading: `Welcome to the list, ${escapeForBody(name)}.`,
    body: `
      <p style="margin:0 0 16px 0">Thanks for jumping on. You'll get our design diary, build notes, and an early invite when we open up — straight from the team building Crema.</p>
      <p style="margin:0 0 16px 0">No filler, no daily digest, no algorithm. Just the long version of what we're up to, every couple of weeks.</p>
      <p style="margin:0">If you ever want off, every email has a one-click unsubscribe.</p>
    `,
    footerNote: "Sent because you subscribed at cremasales.com.",
    unsubscribeUrl: opts.unsubscribeUrl,
  };

  return {
    subject: "Welcome to the Crema list",
    html: renderEmail(layout),
    text: renderEmailText(layout),
  };
}
