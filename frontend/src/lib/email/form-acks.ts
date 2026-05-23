// Orchestrator for form-submit acknowledgment emails fired off the public
// tracker (/api/public/track). Two kinds today:
//
//   mailing_list  ← event_name = "email_signup"
//   demo_request  ← event_name in {"demo_requested", "demo_request_submitted"}
//
// Each kind has its own 24h dedupe so someone who signs up for both the
// mailing list AND a demo receives BOTH emails. The dedupe key is
// (to_email, kind, org_id) — implemented by matching on subject in
// email_sends since the schema's category column is shared with
// verification/marketing sends.

import { getDB } from "@/db/env.server";
import { sendEmail } from "./client";
import { mailingListAck } from "./templates/mailing-list";
import { demoRequestAck } from "./templates/demo-request";

export type FormAckKind = "mailing_list" | "demo_request";

/** event_name → kind. Unknown events return null and nothing fires. */
export function formAckKindForEvent(eventName: string): FormAckKind | null {
  switch (eventName) {
    case "email_signup":
      return "mailing_list";
    case "demo_requested":
    case "demo_request_submitted":
      return "demo_request";
    default:
      return null;
  }
}

export interface MaybeSendFormAckInput {
  kind: FormAckKind;
  contactEmail: string;
  contactFullName: string | null;
  company?: string | null;
  orgId: string;
  appBaseUrl: string;
}

export type MaybeSendFormAckOutcome =
  | { sent: true; resendMessageId: string | null }
  | { sent: false; reason: "within_dedupe_window" | "send_failed" | "skipped_unsubscribed" | "no_email" };

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Look up the subject for the given kind so dedupe can find prior sends of
 * the SAME kind without mixing them up with verifications/marketing blasts.
 * Tied to the template factories — if a factory changes its subject, update
 * this map in the same diff.
 */
function subjectFor(kind: FormAckKind): string {
  switch (kind) {
    case "mailing_list":
      return "Welcome to the Crema list";
    case "demo_request":
      return "Got your Crema demo request";
  }
}

export async function maybeSendFormAck(
  input: MaybeSendFormAckInput,
): Promise<MaybeSendFormAckOutcome> {
  if (!input.contactEmail) return { sent: false, reason: "no_email" };
  const to = input.contactEmail.toLowerCase().trim();
  const subject = subjectFor(input.kind);
  const db = getDB();

  const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const recent = await db
    .prepare(
      `SELECT 1 FROM email_sends
        WHERE to_email = ? AND subject = ? AND org_id = ?
          AND status = 'sent' AND created_at > ?
        LIMIT 1`,
    )
    .bind(to, subject, input.orgId, cutoff)
    .first();
  if (recent) return { sent: false, reason: "within_dedupe_window" };

  // Phase 05 will hand out real unsubscribe tokens; until then the URL is
  // a placeholder. The recipient can still copy/paste it and end up on the
  // unsubscribe route once that lands.
  const unsubscribeUrl = `${input.appBaseUrl}/unsubscribe/pending?c=marketing&email=${encodeURIComponent(to)}`;

  const rendered =
    input.kind === "mailing_list"
      ? mailingListAck({ fullName: input.contactFullName, unsubscribeUrl })
      : demoRequestAck({
          fullName: input.contactFullName,
          company: input.company ?? null,
          unsubscribeUrl,
        });

  // Category mapping reflects the semantics:
  //   demo_request → notification (transactional — direct response to the
  //     user's action; ignored by the unsubscribe gate so confirmations
  //     always reach the person who just asked for the demo).
  //   mailing_list → marketing (recipient consented to a marketing list;
  //     unsubscribe gate applies so future welcome sends respect opt-outs).
  const category = input.kind === "demo_request" ? "notification" : "marketing";

  try {
    const result = await sendEmail({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      category,
      orgId: input.orgId,
      unsubscribeUrl,
    });
    if (result.status === "skipped_unsubscribed") {
      return { sent: false, reason: "skipped_unsubscribed" };
    }
    return { sent: true, resendMessageId: result.resendMessageId };
  } catch (e) {
    console.error("form ack send failed", { kind: input.kind, to, err: String(e) });
    return { sent: false, reason: "send_failed" };
  }
}
