import { renderEmail, renderEmailText, escapeForBody, type EmailLayoutOpts } from "../template";
import type { RenderedEmail } from "./verification";

export interface DemoRequestAckOpts {
  /** Submitter's name if the form captured one. Falls back to "there". */
  fullName: string | null;
  /** Company name from the form's `company` field, optional. */
  company: string | null;
  /** Phase 05 wires this to /unsubscribe/$token?c=marketing. */
  unsubscribeUrl: string;
}

export function demoRequestAck(opts: DemoRequestAckOpts): RenderedEmail {
  const name = (opts.fullName ?? "").trim() || "there";
  const company = (opts.company ?? "").trim();
  const companyPhrase = company ? ` and ${escapeForBody(company)}` : "";

  const layout: EmailLayoutOpts = {
    previewText: "Demo request received — a human from Crema will be in touch.",
    heading: `Thanks, ${escapeForBody(name)}.`,
    body: `
      <p style="margin:0 0 16px 0">We've got your demo request${companyPhrase} on the queue. A human from Crema will reach out within one business day to find a time that works for your team.</p>
      <p style="margin:0 0 16px 0">In the meantime, your submission landed as a real lead in our own CRM — we dogfood the product we're selling.</p>
      <p style="margin:0">Talk soon.</p>
    `,
    footerNote: "Sent because you requested a demo at cremasales.com.",
    unsubscribeUrl: opts.unsubscribeUrl,
  };

  return {
    subject: "Got your Crema demo request",
    html: renderEmail(layout),
    text: renderEmailText(layout),
  };
}
