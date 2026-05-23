import { renderEmail, renderEmailText, escapeForBody, type EmailLayoutOpts } from "../template";
import type { RenderedEmail } from "./verification";

export interface SupportRequestAckOpts {
  fullName: string | null;
  subject: string | null;
  ticketId: string;
  /** Base URL of the marketing site, used to build the ticket continuation link. */
  appBaseUrl: string;
}

export function supportRequestAck(opts: SupportRequestAckOpts): RenderedEmail {
  const name = (opts.fullName ?? "").trim() || "there";
  const issue = (opts.subject ?? "").trim();
  const issueLine = issue
    ? `<p style="margin:0 0 16px 0">Re: <em>${escapeForBody(issue)}</em></p>`
    : "";
  const ticketUrl = `${opts.appBaseUrl.replace(/\/$/, "")}/?ticket=${encodeURIComponent(opts.ticketId)}`;

  const layout: EmailLayoutOpts = {
    previewText: "We got your support request — a human from Crema will reply soon.",
    heading: `Thanks, ${escapeForBody(name)}.`,
    body: `
      ${issueLine}
      <p style="margin:0 0 16px 0">We've received your support request and opened ticket <strong>#${escapeForBody(opts.ticketId.slice(0, 8))}</strong>. A human from Crema will pick it up as soon as we've taken a look — usually within one business day.</p>
      <p style="margin:0 0 16px 0"><a href="${ticketUrl}" style="display:inline-block;padding:10px 18px;border-radius:9999px;background:#3b2418;color:#fff;text-decoration:none;font-weight:500">View or continue this ticket</a></p>
      <p style="margin:0 0 16px 0">Replies happen on the ticket, not over email — open the link above any time to read updates from the team or add to the conversation.</p>
      <p style="margin:0">Talk soon.</p>
    `,
    footerNote: "Sent because you submitted a support request at cremasales.com. This mailbox is unmonitored — please use the ticket link above.",
  };

  return {
    subject: "Got your Crema support request",
    html: renderEmail(layout),
    text: renderEmailText(layout),
  };
}
