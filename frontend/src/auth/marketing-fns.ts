import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDB, getEnv, getExecutionCtx } from "@/db/env.server";
import { sendEmail } from "@/lib/email/client";
import { supportRequestAck } from "@/lib/email/templates/support-request";

// Support acks come from an unmonitored mailbox — the ticket lives inside
// Crema, and we don't ingest replies via Resend. The label keeps "Crema" so
// Gmail/Apple Mail still group threads under the same sender.
const SUPPORT_FROM_ADDRESS = "Crema Support <noreply@cremasales.com>";

// Marketing surfaces always dog-food the CremaSales house org (seeded in
// migration 0004). The deterministic id and guid mean the snippet URL is
// /t/cremasales.js in every environment — local, preview, prod.
export const CREMA_SALES_ORG_ID = "org_cremasales" as const;
export const CREMA_SALES_TRACKING_GUID = "cremasales" as const;

// We still resolve through the DB so a missing/renamed row surfaces as a
// loud null (snippet tag goes blank) rather than silently emitting events
// against a non-existent org. The fallback chain (id → guid → oldest) keeps
// dev DBs that haven't applied 0004 yet limping along.
export const getMarketingGuid = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDB();
  const byId = await db
    .prepare(`SELECT tracking_guid FROM organizations WHERE id = ?`)
    .bind(CREMA_SALES_ORG_ID)
    .first<{ tracking_guid: string }>();
  if (byId?.tracking_guid) return { guid: byId.tracking_guid };
  const byGuid = await db
    .prepare(`SELECT tracking_guid FROM organizations WHERE tracking_guid = ?`)
    .bind(CREMA_SALES_TRACKING_GUID)
    .first<{ tracking_guid: string }>();
  if (byGuid?.tracking_guid) return { guid: byGuid.tracking_guid };
  const oldest = await db
    .prepare(`SELECT tracking_guid FROM organizations ORDER BY created_at ASC LIMIT 1`)
    .first<{ tracking_guid: string }>();
  return { guid: oldest?.tracking_guid ?? null };
});

function uuid(): string {
  return crypto.randomUUID();
}

function domainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const d = email.slice(at + 1).toLowerCase();
  return d.length > 0 ? d : null;
}

async function resolveOwnerId(): Promise<string | null> {
  const db = getDB();
  const admin = await db
    .prepare(
      `SELECT u.id FROM users u
        JOIN organization_members m ON m.user_id = u.id
        WHERE m.org_id = ? AND u.role IN ('admin','manager')
        ORDER BY u.created_at ASC LIMIT 1`,
    )
    .bind(CREMA_SALES_ORG_ID)
    .first<{ id: string }>();
  if (admin?.id) return admin.id;
  const any = await db
    .prepare(
      `SELECT u.id FROM users u
        JOIN organization_members m ON m.user_id = u.id
        WHERE m.org_id = ?
        ORDER BY u.created_at ASC LIMIT 1`,
    )
    .bind(CREMA_SALES_ORG_ID)
    .first<{ id: string }>();
  return any?.id ?? null;
}

async function upsertCompanyByDomain(
  domain: string,
  fallbackName: string,
): Promise<string> {
  const db = getDB();
  const existing = await db
    .prepare(`SELECT id FROM companies WHERE org_id = ? AND domain = ?`)
    .bind(CREMA_SALES_ORG_ID, domain)
    .first<{ id: string }>();
  if (existing?.id) return existing.id;
  const id = uuid();
  await db
    .prepare(
      `INSERT INTO companies (id, name, domain, org_id) VALUES (?, ?, ?, ?)`,
    )
    .bind(id, fallbackName, domain, CREMA_SALES_ORG_ID)
    .run();
  return id;
}

// Upsert via the (org_id, email) unique index from migration 0003. Two
// concurrent submissions for the same email can't race their way into
// duplicate rows; the IGNORE makes that safe, the follow-up UPDATE fills
// in fields a richer submission carries that a thinner earlier one didn't.
async function upsertContact(opts: {
  email: string;
  full_name: string;
  phone: string | null;
  title: string | null;
  company_id: string | null;
  owner_id: string | null;
  stage: "lead" | "contact";
}): Promise<string> {
  const db = getDB();
  const id = uuid();
  await db
    .prepare(
      `INSERT OR IGNORE INTO contacts
         (id, full_name, email, phone, title, company_id, owner_id, org_id, relationship_stage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      opts.full_name,
      opts.email,
      opts.phone,
      opts.title,
      opts.company_id,
      opts.owner_id,
      CREMA_SALES_ORG_ID,
      opts.stage,
    )
    .run();
  // Fill in fields the existing row may be missing without clobbering values
  // a real rep has since edited (COALESCE prefers the existing column).
  await db
    .prepare(
      `UPDATE contacts SET
         full_name  = COALESCE(NULLIF(full_name, ''), ?),
         phone      = COALESCE(phone, ?),
         title      = COALESCE(title, ?),
         company_id = COALESCE(company_id, ?)
       WHERE org_id = ? AND email = ?`,
    )
    .bind(
      opts.full_name,
      opts.phone,
      opts.title,
      opts.company_id,
      CREMA_SALES_ORG_ID,
      opts.email,
    )
    .run();
  const row = await db
    .prepare(`SELECT id FROM contacts WHERE org_id = ? AND email = ?`)
    .bind(CREMA_SALES_ORG_ID, opts.email)
    .first<{ id: string }>();
  if (!row) throw new Error("Failed to upsert contact");
  return row.id;
}

function slaDueAt(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

const NewsletterInput = z.object({
  email: z.string().email().max(200),
});

export const subscribeNewsletter = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => NewsletterInput.parse(d))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase().trim();
    const domain = domainFromEmail(email);
    const ownerId = await resolveOwnerId();
    const companyId = domain
      ? await upsertCompanyByDomain(domain, domain)
      : null;
    const contactId = await upsertContact({
      email,
      full_name: email.split("@")[0]!,
      phone: null,
      title: null,
      company_id: companyId,
      owner_id: ownerId,
      stage: "lead",
    });
    const db = getDB();
    await db
      .prepare(
        `INSERT INTO activities
           (id, type, subject, body, contact_id, owner_id, org_id, occurred_at)
         VALUES (?, 'signal', ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(
        uuid(),
        "Newsletter signup — cremasales.com",
        "Submitted email subscription on /",
        contactId,
        ownerId,
        CREMA_SALES_ORG_ID,
      )
      .run();
    return { ok: true as const, contact_id: contactId };
  });

const DemoInput = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  company: z.string().min(1).max(200),
  title: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  team_size: z.string().max(50).optional(),
  message: z.string().max(2000).optional(),
});

export const requestDemo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => DemoInput.parse(d))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase().trim();
    const domain = domainFromEmail(email);
    const ownerId = await resolveOwnerId();
    const companyId = await upsertCompanyByDomain(
      domain ?? data.company.toLowerCase().replace(/\s+/g, "-"),
      data.company,
    );
    const contactId = await upsertContact({
      email,
      full_name: data.full_name,
      phone: data.phone ?? null,
      title: data.title ?? null,
      company_id: companyId,
      owner_id: ownerId,
      stage: "contact",
    });
    const summary = [
      `Demo requested by ${data.full_name} (${email})`,
      `Company: ${data.company}`,
      data.title ? `Title: ${data.title}` : null,
      data.phone ? `Phone: ${data.phone}` : null,
      data.team_size ? `Team size: ${data.team_size}` : null,
      data.message ? `\n${data.message}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    const db = getDB();
    await db
      .prepare(
        `INSERT INTO activities
           (id, type, subject, body, contact_id, owner_id, org_id, occurred_at)
         VALUES (?, 'signal', ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(
        uuid(),
        `Demo request — ${data.company}`,
        summary,
        contactId,
        ownerId,
        CREMA_SALES_ORG_ID,
      )
      .run();
    // Treat the demo request as a high-priority ticket so it shows up on the
    // morning list and an SLA timer starts ticking — same surface a paying
    // customer's inbound request would land on.
    await db
      .prepare(
        `INSERT INTO tickets
           (id, subject, description, status, priority, contact_id, assigned_to, created_by, org_id, sla_due_at)
         VALUES (?, ?, ?, 'open', 'high', ?, ?, ?, ?, ?)`,
      )
      .bind(
        uuid(),
        `Demo request: ${data.company}`,
        summary,
        contactId,
        ownerId,
        ownerId,
        CREMA_SALES_ORG_ID,
        slaDueAt(24),
      )
      .run();
    return { ok: true as const, contact_id: contactId };
  });

const SupportInput = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(4000),
});

export const submitSupportTicket = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SupportInput.parse(d))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase().trim();
    const domain = domainFromEmail(email);
    const ownerId = await resolveOwnerId();
    const companyId = domain
      ? await upsertCompanyByDomain(domain, domain)
      : null;
    const contactId = await upsertContact({
      email,
      full_name: data.full_name,
      phone: null,
      title: null,
      company_id: companyId,
      owner_id: ownerId,
      stage: "lead",
    });

    const ticketId = uuid();
    const db = getDB();
    await db
      .prepare(
        `INSERT INTO activities
           (id, type, subject, body, contact_id, owner_id, org_id, occurred_at)
         VALUES (?, 'signal', ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(
        uuid(),
        `Support request — ${data.subject}`,
        data.message,
        contactId,
        ownerId,
        CREMA_SALES_ORG_ID,
      )
      .run();
    // Marketing-site support requests land as medium-priority tickets with a
    // 24h SLA — same surface a paying customer's inbound would hit.
    await db
      .prepare(
        `INSERT INTO tickets
           (id, subject, description, status, priority, contact_id, assigned_to, created_by, org_id, sla_due_at)
         VALUES (?, ?, ?, 'open', 'medium', ?, ?, ?, ?, ?)`,
      )
      .bind(
        ticketId,
        `Support: ${data.subject}`,
        `From ${data.full_name} <${email}>\n\n${data.message}`,
        contactId,
        ownerId,
        ownerId,
        CREMA_SALES_ORG_ID,
        slaDueAt(24),
      )
      .run();

    // Transactional ack — direct confirmation of the user's action. Fire via
    // ctx.waitUntil where available so the form response stays snappy; fall
    // back to inline await in dev / non-CF environments.
    const rendered = supportRequestAck({
      fullName: data.full_name,
      subject: data.subject,
      ticketId,
      appBaseUrl: getEnv().APP_BASE_URL,
    });
    const sendPromise = sendEmail({
      to: email,
      from: SUPPORT_FROM_ADDRESS,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      category: "notification",
      orgId: CREMA_SALES_ORG_ID,
    }).catch((e) => {
      console.error("support ack send failed", { to: email, err: String(e) });
    });
    const execCtx = getExecutionCtx();
    if (execCtx) {
      execCtx.waitUntil(sendPromise);
    } else {
      await sendPromise;
    }
    return { ok: true as const, ticket_id: ticketId, contact_id: contactId };
  });

const SupportThreadInput = z.object({
  ticket_id: z.string().uuid(),
  email: z.string().email().max(200),
});

// Anonymous read of a ticket the visitor opened — gated on the email matching
// the ticket's contact so a leaked UUID alone isn't enough. Only public
// comments come back; internal notes stay hidden.
export const getSupportTicketThread = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SupportThreadInput.parse(d))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase().trim();
    const db = getDB();
    const ticket = await db
      .prepare(
        `SELECT t.id, t.subject, t.status, t.priority, t.description,
                t.created_at, t.resolved_at, t.resolution_note,
                c.email AS contact_email, c.full_name AS contact_full_name
         FROM tickets t LEFT JOIN contacts c ON c.id = t.contact_id
         WHERE t.id = ? AND t.org_id = ?`,
      )
      .bind(data.ticket_id, CREMA_SALES_ORG_ID)
      .first<{
        id: string;
        subject: string;
        status: string;
        priority: string;
        description: string | null;
        created_at: string;
        resolved_at: string | null;
        resolution_note: string | null;
        contact_email: string | null;
        contact_full_name: string | null;
      }>();
    if (!ticket || (ticket.contact_email ?? "").toLowerCase() !== email) {
      return { ok: false as const, reason: "not_found" as const };
    }
    const comments = (await db
      .prepare(
        `SELECT tc.id, tc.body, tc.created_at, tc.author_id,
                u.full_name AS author_full_name
         FROM ticket_comments tc LEFT JOIN users u ON u.id = tc.author_id
         WHERE tc.ticket_id = ? AND tc.is_internal = 0
         ORDER BY tc.created_at ASC`,
      )
      .bind(data.ticket_id)
      .all<{
        id: string;
        body: string;
        created_at: string;
        author_id: string | null;
        author_full_name: string | null;
      }>()).results;
    return {
      ok: true as const,
      ticket: {
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        description: ticket.description,
        created_at: ticket.created_at,
        resolved_at: ticket.resolved_at,
        resolution_note: ticket.resolution_note,
        contact_full_name: ticket.contact_full_name,
      },
      comments,
    };
  });

const SupportAppendInput = z.object({
  ticket_id: z.string().uuid(),
  email: z.string().email().max(200),
  full_name: z.string().min(1).max(200),
  message: z.string().min(1).max(4000),
});

// Visitor-side follow-up to an existing ticket. Same email-match gate as the
// thread read. Drops a public comment so it surfaces in the agent's ticket
// drawer, logs an activity for the contact timeline, and re-opens the ticket
// if it had been resolved/closed so the team sees the new reply.
export const appendSupportTicketMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SupportAppendInput.parse(d))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase().trim();
    const db = getDB();
    const ticket = await db
      .prepare(
        `SELECT t.id, t.subject, t.status, t.contact_id, c.email AS contact_email
         FROM tickets t LEFT JOIN contacts c ON c.id = t.contact_id
         WHERE t.id = ? AND t.org_id = ?`,
      )
      .bind(data.ticket_id, CREMA_SALES_ORG_ID)
      .first<{
        id: string;
        subject: string;
        status: string;
        contact_id: string | null;
        contact_email: string | null;
      }>();
    if (!ticket || (ticket.contact_email ?? "").toLowerCase() !== email) {
      return { ok: false as const, reason: "not_found" as const };
    }
    const body = `[Customer follow-up from ${data.full_name} <${email}>]\n\n${data.message}`;
    await db
      .prepare(
        `INSERT INTO ticket_comments (id, ticket_id, body, is_internal, author_id)
         VALUES (?, ?, ?, 0, NULL)`,
      )
      .bind(uuid(), data.ticket_id, body)
      .run();
    const ownerId = await resolveOwnerId();
    await db
      .prepare(
        `INSERT INTO activities
           (id, type, subject, body, contact_id, owner_id, org_id, occurred_at)
         VALUES (?, 'signal', ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(
        uuid(),
        `Support follow-up — ${ticket.subject}`,
        data.message,
        ticket.contact_id,
        ownerId,
        CREMA_SALES_ORG_ID,
      )
      .run();
    if (ticket.status === "resolved" || ticket.status === "closed") {
      await db
        .prepare(`UPDATE tickets SET status = 'open', resolved_at = NULL WHERE id = ?`)
        .bind(data.ticket_id)
        .run();
    }

    const cleanSubject = ticket.subject.replace(/^Support:\s*/, "");
    const rendered = supportRequestAck({
      fullName: data.full_name,
      subject: cleanSubject,
      ticketId: data.ticket_id,
      appBaseUrl: getEnv().APP_BASE_URL,
    });
    const sendPromise = sendEmail({
      to: email,
      from: SUPPORT_FROM_ADDRESS,
      subject: `Re: ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
      category: "notification",
      orgId: CREMA_SALES_ORG_ID,
    }).catch((e) => {
      console.error("support follow-up ack failed", { to: email, err: String(e) });
    });
    const execCtx = getExecutionCtx();
    if (execCtx) {
      execCtx.waitUntil(sendPromise);
    } else {
      await sendPromise;
    }
    return { ok: true as const };
  });
