// The only place that talks to Resend. Every send writes an audit row to
// email_sends — used by the Phase 04 24h dedupe and for "why didn't I get
// my email?" debugging.
//
// Transactional categories (verification, notification) always send.
// Honor-unsubscribe categories (ack, marketing) check email_preferences and
// short-circuit with status='skipped_unsubscribed' when the recipient has
// opted out of that category or all categories.

import { getDB, getEnv } from "@/db/env.server";

export type EmailCategory = "verification" | "ack" | "marketing" | "notification";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  category: EmailCategory;
  orgId?: string | null;
  /**
   * If set, the value is wired into RFC 2369 / RFC 8058 List-Unsubscribe
   * headers so Gmail / Apple Mail show their native unsubscribe affordance.
   * Phase 05 generates this URL; Phase 01/02 callers leave it omitted.
   */
  unsubscribeUrl?: string;
  /** Extra arbitrary headers. Merged onto List-Unsubscribe headers. */
  headers?: Record<string, string>;
  /** Override the global EMAIL_FROM_ADDRESS for this send (e.g. noreply@). */
  from?: string;
}

export interface SendEmailResult {
  id: string;
  resendMessageId: string | null;
  status: "sent" | "failed" | "skipped_unsubscribed";
}

export class ResendError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "ResendError";
  }
}

function honorsUnsubscribe(category: EmailCategory): boolean {
  return category === "ack" || category === "marketing";
}

interface ResendSuccessBody {
  id: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const env = getEnv();
  const db = getDB();
  const id = crypto.randomUUID();
  const to = input.to.toLowerCase().trim();

  if (honorsUnsubscribe(input.category)) {
    const unsubbed = await db
      .prepare(
        `SELECT 1 FROM email_preferences
          WHERE email = ? AND category IN ('all', ?)
          LIMIT 1`,
      )
      .bind(to, input.category)
      .first();
    if (unsubbed) {
      await db
        .prepare(
          `INSERT INTO email_sends (id, to_email, category, subject, status, org_id)
           VALUES (?, ?, ?, ?, 'skipped_unsubscribed', ?)`,
        )
        .bind(id, to, input.category, input.subject, input.orgId ?? null)
        .run();
      return { id, resendMessageId: null, status: "skipped_unsubscribed" };
    }
  }

  const headers: Record<string, string> = { ...(input.headers ?? {}) };
  if (input.unsubscribeUrl) {
    // RFC 8058: one-click POST. Gmail uses this to surface its native unsub UI.
    headers["List-Unsubscribe"] = `<${input.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const text = input.text ?? stripHtml(input.html);

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from ?? env.EMAIL_FROM_ADDRESS,
        to,
        subject: input.subject,
        html: input.html,
        text,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      }),
    });
  } catch (e) {
    // Network/transport error before we got an HTTP status. Record + rethrow.
    const errMsg = e instanceof Error ? e.message : String(e);
    await db
      .prepare(
        `INSERT INTO email_sends (id, to_email, category, subject, status, error, org_id)
         VALUES (?, ?, ?, ?, 'failed', ?, ?)`,
      )
      .bind(id, to, input.category, input.subject, `transport: ${errMsg}`, input.orgId ?? null)
      .run();
    throw new ResendError(`Resend transport failed: ${errMsg}`, 0, errMsg);
  }

  if (!res.ok) {
    const body = await res.text();
    await db
      .prepare(
        `INSERT INTO email_sends (id, to_email, category, subject, status, error, org_id)
         VALUES (?, ?, ?, ?, 'failed', ?, ?)`,
      )
      .bind(id, to, input.category, input.subject, `${res.status}: ${body}`, input.orgId ?? null)
      .run();
    throw new ResendError(`Resend send failed: ${res.status}`, res.status, body);
  }

  const parsed = (await res.json()) as ResendSuccessBody;
  await db
    .prepare(
      `INSERT INTO email_sends (id, to_email, category, subject, resend_message_id, status, org_id)
       VALUES (?, ?, ?, ?, ?, 'sent', ?)`,
    )
    .bind(id, to, input.category, input.subject, parsed.id, input.orgId ?? null)
    .run();
  return { id, resendMessageId: parsed.id, status: "sent" };
}

// Cheap text fallback for callers that don't pre-render a plain-text body.
// Phase 02's renderEmailText() produces a nicer version; this is enough for
// Phase 01 smoke and audit-row legibility.
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
