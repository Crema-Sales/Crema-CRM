import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth, isAdminOrManager } from "@/auth/middleware";
import { getDB } from "@/db/env.server";
import { emitWebhookEvent } from "@/lib/webhooks/emit";
import { isMember } from "@/lib/orgs.server";
import {
  DEAL_STAGES as STAGES,
  STAGE_PROBABILITY_DEFAULTS,
  type DealStage,
} from "@/lib/stages";
import { getStageProbability } from "@/lib/stages.server";
import {
  emailDomain,
  kickOffCompanyEnrichment,
  kickOffContactEnrichment,
  refreshCompanyEnrichment,
  refreshContactEnrichment,
} from "@/lib/enrichment.server";
import { DEFAULT_PROMPTS, PROMPT_KEYS, type PromptKey } from "@/lib/prompts";
import { listOrgPromptsForOrg } from "@/lib/prompts.server";

const RELATIONSHIP_STAGES = ["lead", "contact", "deal", "customer"] as const;
type RelStage = typeof RELATIONSHIP_STAGES[number];

const STAGE_REQUIREMENTS: Record<Exclude<RelStage, "customer">, { key: string; title: string }[]> = {
  lead:    [{ key: "lead:drip",         title: "Assign drip campaign" },
            { key: "lead:calendly",     title: "Send Calendly invite" }],
  contact: [{ key: "contact:discovery", title: "Have discovery meeting" },
            { key: "contact:deal",      title: "Create deal with budget" }],
  deal:    [{ key: "deal:proposal",     title: "Send proposal" },
            { key: "deal:sign",         title: "Sign deal" }],
};

function uuid() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

// ───────────────────────── trigger-equivalents (app-level) ─────────────────────────

function slaDueAt(priority: "low" | "medium" | "high" | "urgent", createdAtIso: string): string {
  const base = new Date(createdAtIso).getTime();
  const hours = priority === "urgent" ? 4 : priority === "high" ? 24 : priority === "low" ? 24 * 7 : 72;
  return new Date(base + hours * 3600_000).toISOString();
}

async function seedStageTasks(contactId: string, ownerId: string, stage: RelStage, fullName: string, orgId: string | null): Promise<void> {
  if (stage === "customer") return;
  const db = getDB();
  const reqs = STAGE_REQUIREMENTS[stage];
  for (const r of reqs) {
    const existing = await db.prepare(
      "SELECT id FROM tasks WHERE related_contact_id = ? AND stage_key = ? LIMIT 1",
    ).bind(contactId, r.key).first();
    if (existing) continue;
    await db.prepare(
      `INSERT INTO tasks (id, title, description, priority, owner_id, related_contact_id, stage_key, org_id)
       VALUES (?, ?, ?, 'medium', ?, ?, ?, ?)`,
    ).bind(uuid(), r.title, `Auto-seeded for ${fullName}`, ownerId, contactId, r.key, orgId).run();
  }
}

async function maybeAdvanceStage(contactId: string): Promise<void> {
  const db = getDB();
  const contact = await db
    .prepare("SELECT id, org_id, relationship_stage FROM contacts WHERE id = ?")
    .bind(contactId)
    .first<{ id: string; org_id: string | null; relationship_stage: RelStage }>();
  if (!contact || contact.relationship_stage === "customer") return;
  const reqs = STAGE_REQUIREMENTS[contact.relationship_stage];
  const keys = reqs.map((r) => r.key);
  const placeholders = keys.map(() => "?").join(",");
  const done = await db.prepare(
    `SELECT COUNT(*) as n FROM tasks WHERE related_contact_id = ? AND stage_key IN (${placeholders}) AND completed = 1`,
  ).bind(contactId, ...keys).first<{ n: number }>();
  if (!done || done.n < keys.length) return;
  const next: RelStage = contact.relationship_stage === "lead" ? "contact" : contact.relationship_stage === "contact" ? "deal" : "customer";
  await db.prepare(
    "UPDATE contacts SET relationship_stage = ?, stage_entered_at = ? WHERE id = ?",
  ).bind(next, now(), contactId).run();
  if (next !== "customer") {
    const c = await db.prepare("SELECT owner_id, full_name FROM contacts WHERE id = ?").bind(contactId).first<{ owner_id: string; full_name: string }>();
    if (c?.owner_id) await seedStageTasks(contactId, c.owner_id, next, c.full_name, contact.org_id);
  }
  if (contact.org_id) {
    emitWebhookEvent(contact.org_id, "contact.stage_changed", {
      contact_id: contactId,
      from_stage: contact.relationship_stage,
      to_stage: next,
    });
  }
}

function ownerClause(role: "admin" | "manager" | "rep", userId: string): { sql: string; params: string[] } {
  if (isAdminOrManager(role)) return { sql: "1=1", params: [] };
  return { sql: "owner_id = ?", params: [userId] };
}

// Org scope clauses. We bind the JWT-derived currentOrgId on every list query so
// a second rep registering into their own org never sees ours (and vice-versa).
// `orgClause()` returns `1=1` when the caller has no org bound — that path is
// only hit on the brand-new account in the seam between sign-up and onboarding.
function orgClause(orgId: string | null | undefined, alias = "org_id"): { sql: string; params: string[] } {
  if (!orgId) return { sql: "1=1", params: [] };
  return { sql: `${alias} = ?`, params: [orgId] };
}

function andWhere(...clauses: { sql: string; params: unknown[] }[]): { sql: string; params: unknown[] } {
  const parts = clauses.filter((c) => c.sql && c.sql !== "1=1").map((c) => c.sql);
  const params = clauses.flatMap((c) => c.params);
  return { sql: parts.length ? parts.join(" AND ") : "1=1", params };
}

// ────────────────────────────────── reads ──────────────────────────────────

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const db = getDB();
    const user = await db.prepare(
      "SELECT id, email, full_name, avatar_url, title, role, sales_methodology, system_prompt FROM users WHERE id = ?",
    ).bind(context.userId).first<{ id: string; email: string; full_name: string | null; avatar_url: string | null; title: string | null; role: string; sales_methodology: string | null; system_prompt: string | null }>();
    return {
      profile: user
        ? {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
            title: user.title,
            sales_methodology: user.sales_methodology,
            system_prompt: user.system_prompt,
          }
        : null,
      roles: user ? [user.role] : [],
      userId: context.userId,
    };
  });

// Maps each contact id to a relationship it belongs to — preferring the one
// where it's the primary contact, then the oldest link. Lets funnel cards
// deep-link into the relationship record; contacts that anchor no relationship
// are simply absent from the map (callers fall back to the contact peek).
async function relationshipByContact(
  db: ReturnType<typeof getDB>,
  contactIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (contactIds.length === 0) return map;
  const ph = contactIds.map(() => "?").join(",");
  const rows = (await db.prepare(
    `SELECT rc.contact_id, rc.relationship_id
     FROM relationship_contacts rc
     JOIN relationships r ON r.id = rc.relationship_id
     WHERE rc.contact_id IN (${ph}) AND r.archived_at IS NULL
     ORDER BY (rc.role = 'primary') DESC, rc.created_at ASC`,
  ).bind(...contactIds).all<any>()).results;
  for (const row of rows) {
    if (!map.has(row.contact_id)) map.set(row.contact_id, row.relationship_id);
  }
  return map;
}

export const getFunnel = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const db = getDB();
    const own = ownerClause(context.role, context.userId);
    const contacts = (await db.prepare(
      `SELECT c.id, c.full_name, c.title, c.relationship_stage, c.stage_entered_at, c.is_ideal_customer,
              c.owner_id,
              co.name AS company_name,
              u.id AS owner_user_id, u.full_name AS owner_full_name, u.avatar_url AS owner_avatar_url
       FROM contacts c
       LEFT JOIN companies co ON co.id = c.company_id
       LEFT JOIN users u ON u.id = c.owner_id
       WHERE c.archived_at IS NULL AND ${own.sql.replace(/owner_id/g, "c.owner_id")}
       ORDER BY c.stage_entered_at DESC`,
    ).bind(...own.params).all<any>()).results;
    const tasks = (await db.prepare(
      `SELECT id, title, completed, stage_key, related_contact_id, priority, due_at FROM tasks WHERE stage_key IS NOT NULL`,
    ).all<any>()).results;
    const byContact = new Map<string, any[]>();
    for (const t of tasks) {
      if (!t.related_contact_id) continue;
      const arr = byContact.get(t.related_contact_id) ?? [];
      arr.push(t);
      byContact.set(t.related_contact_id, arr);
    }
    // Self-heal: contacts that reach a stage outside the normal seeding paths
    // (notably the standalone data-generator, which inserts contacts but no
    // tasks) have no stage-keyed task rows, which leaves every funnel checkbox
    // disabled. Backfill the missing required tasks here so each card is
    // actionable. Idempotent — once a contact is seeded it's skipped on every
    // later load, so this is a one-time cost per contact.
    for (const c of contacts) {
      const stage = c.relationship_stage as RelStage;
      if (stage === "customer") continue;
      const ownerId = (c.owner_id as string | null) ?? context.userId;
      const ctTasks = byContact.get(c.id) ?? [];
      for (const r of STAGE_REQUIREMENTS[stage]) {
        if (ctTasks.some((t: any) => t.stage_key === r.key)) continue;
        const id = uuid();
        await db.prepare(
          `INSERT INTO tasks (id, title, description, priority, owner_id, related_contact_id, stage_key)
           VALUES (?, ?, ?, 'medium', ?, ?, ?)`,
        ).bind(id, r.title, `Auto-seeded for ${c.full_name}`, ownerId, c.id, r.key).run();
        ctTasks.push({ id, title: r.title, completed: 0, stage_key: r.key, related_contact_id: c.id, priority: "medium", due_at: null });
      }
      byContact.set(c.id, ctTasks);
    }
    const relMap = await relationshipByContact(db, contacts.map((c: any) => c.id));
    const enriched = contacts.map((c: any) => {
      const stage = c.relationship_stage as RelStage;
      const required = stage === "customer" ? [] : STAGE_REQUIREMENTS[stage];
      const ctTasks = byContact.get(c.id) ?? [];
      const checklist = required.map((r) => {
        const t = ctTasks.find((x: any) => x.stage_key === r.key);
        return { key: r.key, title: r.title, taskId: t?.id ?? null, completed: Boolean(t?.completed) };
      });
      const done = checklist.filter((x) => x.completed).length;
      const daysInStage = Math.floor((Date.now() - new Date(c.stage_entered_at).getTime()) / 86400000);
      return {
        ...c,
        is_ideal_customer: Boolean(c.is_ideal_customer),
        relationship_id: relMap.get(c.id) ?? null,
        company: c.company_name ? { name: c.company_name } : null,
        owner: c.owner_user_id ? {
          id: c.owner_user_id,
          full_name: c.owner_full_name,
          avatar_url: c.owner_avatar_url,
        } : null,
        checklist, done, total: checklist.length, daysInStage,
      };
    });
    const grouped: Record<RelStage, any[]> = { lead: [], contact: [], deal: [], customer: [] };
    for (const c of enriched) grouped[c.relationship_stage as RelStage].push(c);
    return { grouped, counts: {
      lead: grouped.lead.length, contact: grouped.contact.length,
      deal: grouped.deal.length, customer: grouped.customer.length,
    }};
  });

export const getToday = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const db = getDB();
    // Top relationships: ranked by expected open-deal pipeline value
    // (SUM(value * probability) across deals not yet won/lost). Ties break on
    // most-recent status change.
    const top = (await db.prepare(
      `SELECT r.id, r.name, r.status, r.status_entered_at,
              COALESCE(SUM(CASE WHEN d.stage NOT IN ('won','lost') THEN d.value * d.probability / 100.0 ELSE 0 END), 0) AS expected_value,
              COALESCE(SUM(CASE WHEN d.stage NOT IN ('won','lost') THEN 1 ELSE 0 END), 0) AS open_deals,
              co.name AS company_name
       FROM relationships r
       LEFT JOIN deals d ON d.relationship_id = r.id
       LEFT JOIN relationship_companies rco
         ON rco.relationship_id = r.id AND rco.is_primary = 1
       LEFT JOIN companies co ON co.id = rco.company_id
       WHERE r.archived_at IS NULL AND r.owner_id = ?
       GROUP BY r.id
       ORDER BY expected_value DESC, r.status_entered_at DESC
       LIMIT 10`,
    ).bind(context.userId).all<any>()).results;
    const tasks = (await db.prepare(
      `SELECT id, title, description, priority, due_at, completed, stage_key,
              related_deal_id, related_contact_id, related_ticket_id, created_at
       FROM tasks
       WHERE owner_id = ? AND completed = 0
       ORDER BY due_at IS NULL, due_at ASC`,
    ).bind(context.userId).all<any>()).results;
    return { top, tasks };
  });

export const getRelationships = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const db = getDB();
    const own = ownerClause(context.role, context.userId);
    const rows = (await db.prepare(
      `SELECT c.id, c.full_name, c.email, c.title, c.relationship_stage, c.stage_entered_at, c.owner_id,
              c.is_ideal_customer, co.name AS company_name
       FROM contacts c LEFT JOIN companies co ON co.id = c.company_id
       WHERE c.archived_at IS NULL AND ${own.sql.replace(/owner_id/g, "c.owner_id")}
       ORDER BY c.stage_entered_at DESC`,
    ).bind(...own.params).all<any>()).results;
    return rows.map((r: any) => ({
      ...r,
      is_ideal_customer: Boolean(r.is_ideal_customer),
      company: r.company_name ? { name: r.company_name } : null,
    }));
  });

export const advanceStageManually = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { contactId: string; toStage: RelStage }) =>
    z.object({ contactId: z.string().uuid(), toStage: z.enum(RELATIONSHIP_STAGES) }).parse(d))
  .handler(async ({ context, data }) => {
    const db = getDB();
    const c = await db
      .prepare("SELECT full_name, owner_id, org_id, relationship_stage FROM contacts WHERE id = ?")
      .bind(data.contactId)
      .first<{
        full_name: string;
        owner_id: string;
        org_id: string | null;
        relationship_stage: RelStage;
      }>();
    if (!c) throw new Error("Contact not found");
    await db.prepare(
      "UPDATE contacts SET relationship_stage = ?, stage_entered_at = ? WHERE id = ?",
    ).bind(data.toStage, now(), data.contactId).run();
    await seedStageTasks(data.contactId, c.owner_id ?? context.userId, data.toStage, c.full_name, c.org_id);
    if (c.org_id) {
      emitWebhookEvent(c.org_id, "contact.stage_changed", {
        contact_id: data.contactId,
        from_stage: c.relationship_stage,
        to_stage: data.toStage,
      });
    }
    return { ok: true };
  });

export const archiveContact = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { contactId: string }) => z.object({ contactId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    const pre = await db
      .prepare("SELECT org_id FROM contacts WHERE id = ?")
      .bind(data.contactId)
      .first<{ org_id: string | null }>();
    const archivedAt = now();
    await db
      .prepare("UPDATE contacts SET archived_at = ? WHERE id = ?")
      .bind(archivedAt, data.contactId)
      .run();
    if (pre?.org_id) {
      emitWebhookEvent(pre.org_id, "contact.archived", {
        contact_id: data.contactId,
        archived_at: archivedAt,
      });
    }
    return { ok: true };
  });

// Inbound leads from the public tracker land with owner_id = NULL (track.ts
// has no rep to assign to). Reps need a way to see and claim them; the funnel
// view is owner-scoped so unowned rows are invisible there. Scoped to the
// caller's orgs to keep claims tenant-safe.
export const listUnclaimedLeads = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const db = getDB();
    const rows = (await db.prepare(
      `SELECT c.id, c.full_name, c.email, c.created_at, c.relationship_stage,
              co.name AS company_name
       FROM contacts c
       LEFT JOIN companies co ON co.id = c.company_id
       WHERE c.archived_at IS NULL
         AND c.owner_id IS NULL
         AND c.org_id IS NOT NULL
         AND c.org_id IN (SELECT org_id FROM organization_members WHERE user_id = ?)
       ORDER BY c.created_at DESC
       LIMIT 100`,
    ).bind(context.userId).all<any>()).results;
    const relMap = await relationshipByContact(db, rows.map((r: any) => r.id));
    return rows.map((r: any) => ({
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      relationship_stage: r.relationship_stage,
      relationship_id: relMap.get(r.id) ?? null,
      company: r.company_name ? { name: r.company_name } : null,
      created_at: r.created_at,
    }));
  });

export const claimContact = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { contactId: string }) => z.object({ contactId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = getDB();
    const contact = await db
      .prepare("SELECT id, org_id, owner_id, full_name, relationship_stage FROM contacts WHERE id = ? AND archived_at IS NULL")
      .bind(data.contactId)
      .first<{ id: string; org_id: string | null; owner_id: string | null; full_name: string; relationship_stage: RelStage }>();
    if (!contact) throw new Error("Contact not found");
    if (contact.owner_id) throw new Error("Already claimed");
    if (!contact.org_id || !(await isMember(contact.org_id, context.userId))) {
      throw new Error("Not a member of this contact's organization");
    }
    // Conditional update so a race between two reps clicking Claim at the
    // same time only succeeds for one of them.
    const taken = await db
      .prepare("UPDATE contacts SET owner_id = ? WHERE id = ? AND owner_id IS NULL")
      .bind(context.userId, data.contactId)
      .run();
    if ((taken.meta as { changes?: number })?.changes === 0) {
      throw new Error("Already claimed");
    }
    if (contact.relationship_stage !== "customer") {
      await seedStageTasks(data.contactId, context.userId, contact.relationship_stage, contact.full_name, contact.org_id);
    }
    return { ok: true };
  });

export const autoAdvanceStage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { stage: Exclude<RelStage, "customer"> }) =>
    z.object({ stage: z.enum(["lead", "contact", "deal"] as const) }).parse(d))
  .handler(async ({ context, data }) => {
    const db = getDB();
    const reqKeys = STAGE_REQUIREMENTS[data.stage].map((r) => r.key);
    const own = ownerClause(context.role, context.userId);
    const contacts = (await db.prepare(
      `SELECT id FROM contacts WHERE relationship_stage = ? AND archived_at IS NULL AND ${own.sql}`,
    ).bind(data.stage, ...own.params).all<{ id: string }>()).results;
    if (contacts.length === 0) return { advanced: 0 };
    const ids = contacts.map((c) => c.id);
    const placeholders = ids.map(() => "?").join(",");
    const keyPlaceholders = reqKeys.map(() => "?").join(",");
    const tasks = (await db.prepare(
      `SELECT id, stage_key, related_contact_id, completed FROM tasks
       WHERE related_contact_id IN (${placeholders}) AND stage_key IN (${keyPlaceholders}) AND completed = 0`,
    ).bind(...ids, ...reqKeys).all<{ id: string; stage_key: string; related_contact_id: string; completed: number }>()).results;
    const pickPerContact = new Map<string, string>();
    for (const id of ids) {
      for (const key of reqKeys) {
        const t = tasks.find((x) => x.related_contact_id === id && x.stage_key === key);
        if (t) { pickPerContact.set(id, t.id); break; }
      }
    }
    const taskIds = Array.from(pickPerContact.values());
    if (taskIds.length === 0) return { advanced: 0 };
    const taskPh = taskIds.map(() => "?").join(",");
    await db.prepare(`UPDATE tasks SET completed = 1 WHERE id IN (${taskPh})`).bind(...taskIds).run();
    for (const contactId of pickPerContact.keys()) await maybeAdvanceStage(contactId);
    return { advanced: taskIds.length };
  });

// ────────────────────────────────── dashboard ──────────────────────────────────

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const db = getDB();
    const orgId = context.currentOrgId;
    const allDeals = (await db
      .prepare(`SELECT * FROM deals WHERE ${orgClause(orgId).sql} ORDER BY created_at DESC`)
      .bind(...orgClause(orgId).params)
      .all<any>()).results;
    const tasks = (await db.prepare(
      `SELECT * FROM tasks WHERE completed = 0 AND ${orgClause(orgId).sql} ORDER BY due_at IS NULL, due_at ASC LIMIT 8`,
    ).bind(...orgClause(orgId).params).all<any>()).results;
    const activities = (await db.prepare(
      `SELECT a.*, c.full_name AS contact_full_name, c.company_id AS contact_company_id
       FROM activities a LEFT JOIN contacts c ON c.id = a.contact_id
       WHERE ${orgClause(orgId, "a.org_id").sql}
       ORDER BY a.occurred_at DESC LIMIT 8`,
    ).bind(...orgClause(orgId).params).all<any>()).results.map((r: any) => ({
      ...r,
      contact: r.contact_id ? { full_name: r.contact_full_name, company_id: r.contact_company_id } : null,
    }));
    const tickets = (await db.prepare(
      `SELECT * FROM tickets WHERE status IN ('open','pending') AND ${orgClause(orgId).sql}`,
    ).bind(...orgClause(orgId).params).all<any>()).results;
    const spotlightRow = await db.prepare(
      `SELECT c.*, co.name AS company_name FROM contacts c LEFT JOIN companies co ON co.id = c.company_id
       WHERE ${orgClause(orgId, "c.org_id").sql} AND c.archived_at IS NULL
       ORDER BY c.created_at DESC LIMIT 1`,
    ).bind(...orgClause(orgId).params).first<any>();
    const spotlight = spotlightRow ? { ...spotlightRow, company: spotlightRow.company_name ? { name: spotlightRow.company_name } : null } : null;

    const myDeals = allDeals.filter((d: any) => d.owner_id === context.userId);
    const openValue = myDeals.filter((d: any) => !["won","lost"].includes(d.stage)).reduce((s: number, d: any) => s + Number(d.value || 0), 0);
    const wonValue = myDeals.filter((d: any) => d.stage === "won").reduce((s: number, d: any) => s + Number(d.value || 0), 0);
    const stageCounts = STAGES.reduce((acc, s) => {
      const items = myDeals.filter((d: any) => d.stage === s);
      acc[s] = { count: items.length, value: items.reduce((sm: number, d: any) => sm + Number(d.value || 0), 0) };
      return acc;
    }, {} as Record<string, { count: number; value: number }>);
    const overdueTickets = tickets.filter((t: any) => t.sla_due_at && new Date(t.sla_due_at) < new Date()).length;
    return {
      kpis: {
        openValue, wonValue,
        openDeals: myDeals.filter((d: any) => !["won","lost"].includes(d.stage)).length,
        overdueTickets,
      },
      stageCounts,
      tasks,
      activities,
      spotlight,
      myDealsCount: myDeals.length,
    };
  });

export const aiBriefing = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const user = await getDB().prepare("SELECT full_name FROM users WHERE id = ?").bind(context.userId).first<{ full_name: string | null }>();
    const name = user?.full_name?.split(" ")[0] ?? "there";
    return { text: `Good morning, ${name}. AI briefing will return once the backend agent is wired up.` };
  });

// ────────────────────────────────── deals ──────────────────────────────────

export const listDeals = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const own = ownerClause(context.role, context.userId);
    const org = orgClause(context.currentOrgId, "d.org_id");
    const where = andWhere(
      { sql: org.sql, params: org.params },
      { sql: own.sql.replace(/owner_id/g, "d.owner_id"), params: own.params },
    );
    const rows = (await getDB().prepare(
      `SELECT d.*, co.name AS company_name, c.full_name AS contact_full_name
       FROM deals d
       LEFT JOIN companies co ON co.id = d.company_id
       LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE ${where.sql}
       ORDER BY d.sort_order`,
    ).bind(...where.params).all<any>()).results;
    return rows.map((r: any) => ({
      ...r,
      company: r.company_id ? { name: r.company_name } : null,
      contact: r.contact_id ? { full_name: r.contact_full_name } : null,
    }));
  });

export const updateDealStage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string; stage: DealStage }) =>
    z.object({ id: z.string().uuid(), stage: z.enum(STAGES) }).parse(d))
  .handler(async ({ context, data }) => {
    const db = getDB();
    // Snap probability to the org's configured value for this stage.
    // Reading deals.org_id (not context.currentOrgId) keeps cross-org admin
    // moves honest — the deal's owning org wins.
    const pre = await db
      .prepare("SELECT org_id, stage, closed_at FROM deals WHERE id = ?")
      .bind(data.id)
      .first<{ org_id: string | null; stage: DealStage; closed_at: string | null }>();
    const orgId = pre?.org_id ?? context.currentOrgId;
    const probability = orgId
      ? await getStageProbability(orgId, data.stage)
      : STAGE_PROBABILITY_DEFAULTS[data.stage];
    // closed_at tracks the actual realized close. Set when entering 'won',
    // clear when leaving it (revert from a misclick must not leave a
    // stale attainment row). expected_close stays untouched — it's the
    // forecast date and drives pipeline windowing.
    const wasWon = pre?.stage === "won";
    const isWon = data.stage === "won";
    let closedAtSql = "closed_at";
    if (!wasWon && isWon) closedAtSql = "datetime('now')";
    else if (wasWon && !isWon) closedAtSql = "NULL";
    await db
      .prepare(
        `UPDATE deals SET stage = ?, probability = ?, closed_at = ${closedAtSql} WHERE id = ?`,
      )
      .bind(data.stage, probability, data.id)
      .run();
    if (pre?.org_id && pre.stage !== data.stage) {
      if (data.stage === "won" || data.stage === "lost") {
        const row = await db
          .prepare("SELECT * FROM deals WHERE id = ?")
          .bind(data.id)
          .first<{ value: number } & Record<string, unknown>>();
        if (row) {
          if (data.stage === "won") {
            emitWebhookEvent(pre.org_id, "deal.won", { deal: row, value: row.value });
          } else {
            emitWebhookEvent(pre.org_id, "deal.lost", { deal: row });
          }
        }
      } else {
        emitWebhookEvent(pre.org_id, "deal.stage_changed", {
          deal_id: data.id,
          from_stage: pre.stage,
          to_stage: data.stage,
        });
      }
    }
    return { ok: true, probability };
  });

export const createDeal = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { name: string; value: number; stage?: DealStage; company_id?: string | null; contact_id?: string | null; relationship_id?: string | null }) =>
    z.object({
      name: z.string().min(1).max(200),
      value: z.number().min(0),
      stage: z.enum(STAGES).optional(),
      company_id: z.string().uuid().nullable().optional(),
      contact_id: z.string().uuid().nullable().optional(),
      relationship_id: z.string().uuid().nullable().optional(),
    }).parse(d))
  .handler(async ({ context, data }) => {
    const id = uuid();
    const db = getDB();
    const stage: DealStage = data.stage ?? "discovery";
    const probability = context.currentOrgId
      ? await getStageProbability(context.currentOrgId, stage)
      : STAGE_PROBABILITY_DEFAULTS[stage];
    // If the deal is born already-won (uncommon but possible via the
    // tool layer or backfill), stamp closed_at so attainment picks it up.
    const closedAt = stage === "won" ? now() : null;
    await db.prepare(
      `INSERT INTO deals (id, name, value, stage, probability, company_id, contact_id, relationship_id, owner_id, org_id, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      data.name,
      data.value,
      stage,
      probability,
      data.company_id ?? null,
      data.contact_id ?? null,
      data.relationship_id ?? null,
      context.userId,
      context.currentOrgId ?? null,
      closedAt,
    ).run();
    const row = await db.prepare("SELECT * FROM deals WHERE id = ?").bind(id).first<any>();
    if (row?.org_id) {
      emitWebhookEvent(row.org_id, "deal.created", { deal: row });
    }
    return row ?? null;
  });

export const getDeal = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    const deal = await db.prepare(
      `SELECT d.*, co.name AS company_name, co.domain AS company_domain,
              co.industry AS company_industry, co.employee_count AS company_employee_count,
              co.location AS company_location,
              c.full_name AS contact_full_name, c.email AS contact_email
       FROM deals d LEFT JOIN companies co ON co.id = d.company_id LEFT JOIN contacts c ON c.id = d.contact_id
       WHERE d.id = ?`,
    ).bind(data.id).first<any>();
    if (!deal) return { deal: null, activities: [] };
    const activities = (await db.prepare(
      `SELECT * FROM activities WHERE deal_id = ? ORDER BY occurred_at DESC LIMIT 50`,
    ).bind(data.id).all<any>()).results;
    return {
      deal: {
        ...deal,
        company: deal.company_id ? {
          id: deal.company_id, name: deal.company_name, domain: deal.company_domain,
          industry: deal.company_industry, employee_count: deal.company_employee_count,
          location: deal.company_location,
        } : null,
        contact: deal.contact_id ? {
          id: deal.contact_id, full_name: deal.contact_full_name, email: deal.contact_email,
        } : null,
      },
      activities,
    };
  });

export const updateDeal = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: {
    id: string;
    name: string;
    value: number;
    company_id?: string | null;
    contact_id?: string | null;
    expected_close?: string | null;
  }) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(200),
      value: z.number().min(0),
      company_id: z.string().uuid().nullable().optional(),
      contact_id: z.string().uuid().nullable().optional(),
      expected_close: z.string().nullable().optional(),
    }).parse(d))
  .handler(async ({ data }) => {
    await getDB()
      .prepare(
        `UPDATE deals SET name = ?, value = ?, company_id = ?, contact_id = ?, expected_close = ?
         WHERE id = ?`,
      )
      .bind(data.name, data.value, data.company_id ?? null, data.contact_id ?? null, data.expected_close ?? null, data.id)
      .run();
    return { ok: true };
  });

// ────────────────────────────────── contacts ──────────────────────────────────

export const listContacts = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const own = ownerClause(context.role, context.userId);
    const org = orgClause(context.currentOrgId, "c.org_id");
    const where = andWhere(
      { sql: "c.archived_at IS NULL", params: [] },
      { sql: org.sql, params: org.params },
      { sql: own.sql.replace(/owner_id/g, "c.owner_id"), params: own.params },
    );
    const rows = (await getDB().prepare(
      `SELECT c.*, co.name AS company_name, co.industry AS company_industry,
              co.location AS company_location
       FROM contacts c LEFT JOIN companies co ON co.id = c.company_id
       WHERE ${where.sql}
       ORDER BY c.created_at DESC`,
    ).bind(...where.params).all<any>()).results;
    return rows.map((r: any) => ({
      ...r,
      is_ideal_customer: Boolean(r.is_ideal_customer),
      company: r.company_id ? {
        name: r.company_name,
        industry: r.company_industry,
        location: r.company_location,
      } : null,
    }));
  });

export const getContact = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    const contactRow = await db.prepare(
      `SELECT c.*, co.id AS co_id, co.name AS co_name, co.domain AS co_domain, co.industry AS co_industry,
              co.employee_count AS co_employees, co.location AS co_location,
              u.id AS owner_user_id, u.full_name AS owner_full_name, u.email AS owner_email,
              u.avatar_url AS owner_avatar_url
       FROM contacts c
       LEFT JOIN companies co ON co.id = c.company_id
       LEFT JOIN users u ON u.id = c.owner_id
       WHERE c.id = ?`,
    ).bind(data.id).first<any>();
    const contact = contactRow ? {
      ...contactRow,
      is_ideal_customer: Boolean(contactRow.is_ideal_customer),
      company: contactRow.co_id ? {
        id: contactRow.co_id, name: contactRow.co_name, domain: contactRow.co_domain,
        industry: contactRow.co_industry, employee_count: contactRow.co_employees,
        location: contactRow.co_location,
      } : null,
      owner: contactRow.owner_user_id ? {
        id: contactRow.owner_user_id,
        full_name: contactRow.owner_full_name,
        email: contactRow.owner_email,
        avatar_url: contactRow.owner_avatar_url,
      } : null,
    } : null;
    const [activities, purchases, deals, tasks] = await Promise.all([
      db.prepare(`SELECT * FROM activities WHERE contact_id = ? ORDER BY occurred_at DESC`).bind(data.id).all<any>(),
      db.prepare(`SELECT * FROM purchases WHERE contact_id = ? ORDER BY occurred_at DESC`).bind(data.id).all<any>(),
      db.prepare(`SELECT * FROM deals WHERE contact_id = ?`).bind(data.id).all<any>(),
      db.prepare(`SELECT * FROM tasks WHERE related_contact_id = ? ORDER BY completed ASC, due_at IS NULL, due_at ASC, created_at DESC`).bind(data.id).all<any>(),
    ]);
    const ltv = purchases.results.reduce((s: number, p: any) => s + Number(p.amount), 0);
    return {
      contact,
      activities: activities.results,
      purchases: purchases.results,
      deals: deals.results,
      tasks: tasks.results.map((t: any) => ({ ...t, completed: Boolean(t.completed) })),
      ltv,
    };
  });

export const upsertContact = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id?: string; full_name: string; email?: string; phone?: string; title?: string; company_id?: string | null; notes?: string; owner_id?: string }) =>
    z.object({
      id: z.string().uuid().optional(),
      full_name: z.string().min(1).max(200),
      email: z.string().email().or(z.literal("")).optional(),
      phone: z.string().max(50).optional(),
      title: z.string().max(120).optional(),
      company_id: z.string().uuid().nullable().optional(),
      notes: z.string().max(5000).optional(),
      owner_id: z.string().uuid().optional(),
    }).parse(d))
  .handler(async ({ context, data }) => {
    const db = getDB();

    // If the caller gave us an email but no company link, try to auto-link
    // (and auto-create + enrich) a company shell from the email's domain.
    // Personal-email domains (gmail/outlook/…) are skipped — they don't
    // identify a real organization.
    let resolvedCompanyId: string | null | undefined = data.company_id;
    let companyAutoCreated = false;
    let companyAutoCreatedId: string | null = null;
    if (!resolvedCompanyId && data.email && context.currentOrgId) {
      const domain = emailDomain(data.email);
      if (domain) {
        const existing = await db
          .prepare(
            "SELECT id FROM companies WHERE org_id = ? AND lower(domain) = ? LIMIT 1",
          )
          .bind(context.currentOrgId, domain)
          .first<{ id: string }>();
        if (existing) {
          resolvedCompanyId = existing.id;
        } else {
          const newCompanyId = uuid();
          await db
            .prepare(
              `INSERT INTO companies (id, name, domain, created_by, org_id) VALUES (?, ?, ?, ?, ?)`,
            )
            .bind(newCompanyId, domain, domain, context.userId, context.currentOrgId)
            .run();
          resolvedCompanyId = newCompanyId;
          companyAutoCreated = true;
          companyAutoCreatedId = newCompanyId;
        }
      }
    }

    if (data.id) {
      // Owner reassignment is admin/manager only — ignore the field silently
      // for reps so the same form can submit it without erroring. Also verify
      // the target user is a member of the caller's current org to prevent
      // assigning to a stranger from another workspace.
      let reassignOwnerId: string | null = null;
      if (data.owner_id && isAdminOrManager(context.role)) {
        if (context.currentOrgId) {
          const ok = await isMember(context.currentOrgId, data.owner_id);
          if (!ok) throw new Error("That user is not a member of this organization");
        }
        reassignOwnerId = data.owner_id;
      }

      // Detect an email change so we can re-enrich the contact on the new signal.
      const prior = await db
        .prepare("SELECT email, org_id FROM contacts WHERE id = ?")
        .bind(data.id)
        .first<{ email: string | null; org_id: string | null }>();

      if (reassignOwnerId) {
        await db.prepare(
          `UPDATE contacts SET full_name = ?, email = ?, phone = ?, title = ?, company_id = ?, notes = ?, owner_id = ?
           WHERE id = ?`,
        ).bind(
          data.full_name, data.email || null, data.phone || null, data.title || null,
          resolvedCompanyId ?? null, data.notes || null, reassignOwnerId, data.id,
        ).run();
      } else {
        await db.prepare(
          `UPDATE contacts SET full_name = ?, email = ?, phone = ?, title = ?, company_id = ?, notes = ?
           WHERE id = ?`,
        ).bind(
          data.full_name, data.email || null, data.phone || null, data.title || null,
          resolvedCompanyId ?? null, data.notes || null, data.id,
        ).run();
      }

      if (companyAutoCreated && companyAutoCreatedId) {
        kickOffCompanyEnrichment(context.currentOrgId, companyAutoCreatedId);
      }
      const emailChanged = (data.email || null) !== (prior?.email ?? null);
      if (data.email && emailChanged) {
        kickOffContactEnrichment(prior?.org_id ?? context.currentOrgId, data.id);
      }
    } else {
      const id = uuid();
      await db.prepare(
        `INSERT INTO contacts (id, full_name, email, phone, title, company_id, notes, owner_id, org_id, relationship_stage, stage_entered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'lead', ?)`,
      ).bind(
        id, data.full_name, data.email || null, data.phone || null, data.title || null,
        resolvedCompanyId ?? null, data.notes || null, context.userId,
        context.currentOrgId ?? null, now(),
      ).run();
      await seedStageTasks(id, context.userId, "lead", data.full_name, context.currentOrgId ?? null);
      const row = await db
        .prepare("SELECT * FROM contacts WHERE id = ?")
        .bind(id)
        .first<{ org_id: string | null } & Record<string, unknown>>();
      if (row?.org_id) {
        emitWebhookEvent(row.org_id, "contact.created", { contact: row });
      }
      if (companyAutoCreated && companyAutoCreatedId) {
        kickOffCompanyEnrichment(context.currentOrgId, companyAutoCreatedId);
      }
      if (data.email) {
        kickOffContactEnrichment(row?.org_id ?? context.currentOrgId, id);
      }
    }
    return { ok: true };
  });

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    // Soft-delete so the activity timeline behind this contact stays loadable
    // for audit and so MUST #4 ingest demos don't lose history on a misclick.
    await getDB()
      .prepare("UPDATE contacts SET archived_at = ? WHERE id = ?")
      .bind(now(), data.id)
      .run();
    return { ok: true };
  });

// ────────────────────────────────── companies ──────────────────────────────────

export const listCompanies = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const db = getDB();
    const org = orgClause(context.currentOrgId);
    const [companies, contactCounts, dealRows] = await Promise.all([
      db.prepare(`SELECT * FROM companies WHERE ${org.sql} ORDER BY name`).bind(...org.params).all<any>(),
      db.prepare(
        `SELECT company_id, COUNT(*) AS n FROM contacts
         WHERE archived_at IS NULL AND company_id IS NOT NULL AND ${org.sql}
         GROUP BY company_id`,
      ).bind(...org.params).all<{ company_id: string; n: number }>(),
      db.prepare(
        `SELECT company_id, value, stage FROM deals
         WHERE company_id IS NOT NULL AND ${org.sql}`,
      ).bind(...org.params).all<any>(),
    ]);
    const cMap = new Map(contactCounts.results.map((r) => [r.company_id, r.n]));
    const dMap = new Map<string, { count: number; openValue: number }>();
    for (const d of dealRows.results) {
      const cur = dMap.get(d.company_id) ?? { count: 0, openValue: 0 };
      cur.count += 1;
      if (d.stage !== "won" && d.stage !== "lost") cur.openValue += Number(d.value ?? 0);
      dMap.set(d.company_id, cur);
    }
    return companies.results.map((c: any) => ({
      ...c,
      contact_count: cMap.get(c.id) ?? 0,
      deal_count: dMap.get(c.id)?.count ?? 0,
      open_value: dMap.get(c.id)?.openValue ?? 0,
    }));
  });

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { name: string; domain?: string; industry?: string; location?: string; employee_count?: number; notes?: string }) =>
    z.object({
      name: z.string().min(1).max(200),
      domain: z.string().max(200).optional(),
      industry: z.string().max(120).optional(),
      location: z.string().max(200).optional(),
      employee_count: z.number().int().nonnegative().optional(),
      notes: z.string().max(2000).optional(),
    }).parse(d))
  .handler(async ({ context, data }) => {
    const id = uuid();
    await getDB().prepare(
      `INSERT INTO companies (id, name, domain, industry, location, employee_count, notes, created_by, org_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, data.name, data.domain || null, data.industry || null, data.location || null, data.employee_count ?? null, data.notes || null, context.userId, context.currentOrgId).run();
    if (data.domain && data.domain.trim().length > 0) {
      kickOffCompanyEnrichment(context.currentOrgId, id);
    }
    return { id };
  });

export const updateCompany = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string; name?: string; domain?: string | null; industry?: string | null; location?: string | null; employee_count?: number | null; notes?: string | null }) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(200).optional(),
      domain: z.string().max(200).nullable().optional(),
      industry: z.string().max(120).nullable().optional(),
      location: z.string().max(200).nullable().optional(),
      employee_count: z.number().int().nonnegative().nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
    }).parse(d))
  .handler(async ({ context, data }) => {
    const db = getDB();
    // Read the prior domain so we can detect a fresh domain arrival and fire
    // enrichment when the column transitions from null/empty to a real value.
    const prior = await db
      .prepare("SELECT domain, org_id FROM companies WHERE id = ?")
      .bind(data.id)
      .first<{ domain: string | null; org_id: string | null }>();

    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.name !== undefined)           { fields.push("name = ?");           values.push(data.name); }
    if (data.domain !== undefined)         { fields.push("domain = ?");         values.push(data.domain); }
    if (data.industry !== undefined)       { fields.push("industry = ?");       values.push(data.industry); }
    if (data.location !== undefined)       { fields.push("location = ?");       values.push(data.location); }
    if (data.employee_count !== undefined) { fields.push("employee_count = ?"); values.push(data.employee_count); }
    if (data.notes !== undefined)          { fields.push("notes = ?");          values.push(data.notes); }
    if (fields.length === 0) return { ok: true };
    values.push(data.id);
    await db.prepare(`UPDATE companies SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();

    if (data.domain !== undefined) {
      const next = (data.domain ?? "").trim();
      const before = (prior?.domain ?? "").trim();
      if (next && next !== before) {
        kickOffCompanyEnrichment(prior?.org_id ?? context.currentOrgId, data.id);
      }
    }
    return { ok: true };
  });

export const getCompany = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    const [company, contacts, deals] = await Promise.all([
      db.prepare(`SELECT * FROM companies WHERE id = ?`).bind(data.id).first<any>(),
      db.prepare(`SELECT * FROM contacts WHERE company_id = ?`).bind(data.id).all<any>(),
      db.prepare(`SELECT * FROM deals WHERE company_id = ? ORDER BY created_at DESC`).bind(data.id).all<any>(),
    ]);
    const contactIds = contacts.results.map((c: any) => c.id);
    let activities: any[] = [];
    if (contactIds.length) {
      const ph = contactIds.map(() => "?").join(",");
      const rows = (await db.prepare(
        `SELECT a.*, c.full_name AS contact_full_name FROM activities a LEFT JOIN contacts c ON c.id = a.contact_id
         WHERE a.contact_id IN (${ph}) ORDER BY a.occurred_at DESC LIMIT 30`,
      ).bind(...contactIds).all<any>()).results;
      activities = rows.map((r: any) => ({ ...r, contact: r.contact_id ? { full_name: r.contact_full_name } : null }));
    }
    return { company, contacts: contacts.results, deals: deals.results, activities };
  });

// ────────────────────────────────── leads ──────────────────────────────────

// TODO(webhooks): emit `lead.created` when a non-seed insert path lands. Today the
// only `INSERT INTO leads` site is `seedDemo` (which intentionally does not emit),
// and neither `/api/public/track` nor `/api/public/ingest` writes a leads row. When
// a live lead-creation surface is added (CRM UI, ingest path, or score-promotion),
// emit `lead.created` with `{ lead: <row> }` after the INSERT, scoped to `row.org_id`.

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const own = ownerClause(context.role, context.userId);
    const org = orgClause(context.currentOrgId, "l.org_id");
    const where = andWhere(
      { sql: org.sql, params: org.params },
      { sql: own.sql.replace(/owner_id/g, "l.owner_id"), params: own.params },
    );
    const rows = (await getDB().prepare(
      `SELECT l.*, c.full_name AS contact_full_name, c.email AS contact_email, c.company_id AS contact_company_id
       FROM leads l LEFT JOIN contacts c ON c.id = l.contact_id
       WHERE ${where.sql}
       ORDER BY l.score DESC`,
    ).bind(...where.params).all<any>()).results;
    return rows.map((r: any) => ({
      ...r,
      contact: r.contact_id ? { full_name: r.contact_full_name, email: r.contact_email, company_id: r.contact_company_id } : null,
    }));
  });

export const scoreLead = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    const lead = await db.prepare(`SELECT * FROM leads WHERE id = ?`).bind(data.id).first<any>();
    if (!lead) throw new Error("Lead not found");
    const contact = await db.prepare(`SELECT * FROM contacts WHERE id = ?`).bind(lead.contact_id).first<any>();
    const [activities, purchases] = await Promise.all([
      db.prepare(`SELECT COUNT(*) AS n FROM activities WHERE contact_id = ?`).bind(lead.contact_id).first<{ n: number }>(),
      db.prepare(`SELECT amount FROM purchases WHERE contact_id = ?`).bind(lead.contact_id).all<{ amount: number }>(),
    ]);
    const score = Math.min(100, (activities?.n ?? 0) * 6 + purchases.results.length * 20 + (contact?.is_ideal_customer ? 25 : 0));
    const ltv = purchases.results.reduce((s, p) => s + Number(p.amount), 0);
    await db.prepare(
      `UPDATE leads SET score = ?, estimated_ltv = ?, ai_reasoning = ? WHERE id = ?`,
    ).bind(score, ltv || lead.estimated_ltv, "Heuristic score (AI gateway pending).", data.id).run();
    return { score, reasoning: "Heuristic score (AI gateway pending)." };
  });

export const scoreAllLeads = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async () => {
    const leads = (await getDB().prepare(`SELECT id FROM leads`).all<{ id: string }>()).results;
    return { count: leads.length, ids: leads.map((l) => l.id) };
  });

// ────────────────────────────────── deal qualification ──────────────────────────────────

// Sparse map: { criterion_key -> { status, notes, updated_at } }.
const QualificationStateSchema = z.object({
  status: z.enum(["unknown", "partial", "confirmed"]),
  notes: z.string().max(2000).optional(),
  updated_at: z.string().optional(),
});

export const updateDealQualification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: {
    deal_id: string;
    criterion_key: string;
    status: "unknown" | "partial" | "confirmed";
    notes?: string;
  }) =>
    z.object({
      deal_id: z.string().uuid(),
      criterion_key: z.string().min(1).max(64),
      status: z.enum(["unknown", "partial", "confirmed"]),
      notes: z.string().max(2000).optional(),
    }).parse(d))
  .handler(async ({ context, data }) => {
    const db = getDB();
    const row = await db
      .prepare("SELECT qualification_json FROM deals WHERE id = ?")
      .bind(data.deal_id)
      .first<{ qualification_json: string | null }>();
    if (!row) throw new Error("Deal not found");
    type State = { status: "unknown" | "partial" | "confirmed"; notes?: string; updated_at?: string };
    let parsed: Record<string, State> = {};
    if (row.qualification_json) {
      try {
        const candidate = JSON.parse(row.qualification_json);
        if (candidate && typeof candidate === "object") parsed = candidate as Record<string, State>;
      } catch {
        // Corrupt JSON — start fresh rather than 500.
        parsed = {};
      }
    }
    parsed[data.criterion_key] = QualificationStateSchema.parse({
      status: data.status,
      notes: data.notes,
      updated_at: now(),
    });
    const stringified = JSON.stringify(parsed);
    await db
      .prepare("UPDATE deals SET qualification_json = ? WHERE id = ?")
      .bind(stringified, data.deal_id)
      .run();
    // Return the stringified shape so TanStack Start's serializer is happy.
    // The client parses it back via parseQualification().
    return { ok: true, qualification_json: stringified, updated_by: context.userId };
  });

// ────────────────────────────────── profile ──────────────────────────────────

const METHODOLOGY_VALUES = ["none", "BANT", "MEDDIC", "MEDDPICC", "SPIN", "CHAMP"] as const;
type MethodologyValue = (typeof METHODOLOGY_VALUES)[number];

export const USER_SYSTEM_PROMPT_MAX = 4000;

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: {
    full_name?: string;
    title?: string;
    avatar_url?: string;
    sales_methodology?: MethodologyValue | null;
    system_prompt?: string | null;
  }) =>
    z.object({
      full_name: z.string().min(1).max(200).optional(),
      title: z.string().max(200).optional(),
      avatar_url: z.string().url().optional().or(z.literal("")),
      // null = inherit org. A value of "none" = explicit opt-out.
      sales_methodology: z.enum(METHODOLOGY_VALUES).nullable().optional(),
      // Free-form personal prompt overlay. Cap at 4000 chars to keep the JWT
      // under URL-length limits when the WebSocket connects (token rides as
      // a `?token=` query param).
      system_prompt: z.string().max(USER_SYSTEM_PROMPT_MAX).nullable().optional(),
    }).parse(d))
  .handler(async ({ context, data }) => {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.full_name !== undefined) { fields.push("full_name = ?"); values.push(data.full_name); }
    if (data.title !== undefined)     { fields.push("title = ?");     values.push(data.title); }
    if (data.avatar_url !== undefined){ fields.push("avatar_url = ?"); values.push(data.avatar_url); }
    if (data.sales_methodology !== undefined) {
      fields.push("sales_methodology = ?");
      values.push(data.sales_methodology);
    }
    if (data.system_prompt !== undefined) {
      fields.push("system_prompt = ?");
      const trimmed =
        data.system_prompt && data.system_prompt.trim().length > 0
          ? data.system_prompt
          : null;
      values.push(trimmed);
    }
    if (fields.length === 0) return { ok: true };
    values.push(context.userId);
    await getDB().prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    // If the user changed their personal system prompt, rebake the cookie so
    // the new value rides the JWT on the next agent WS connection — same
    // pattern as setMyCoachPersona / org rename.
    if (data.system_prompt !== undefined) {
      await rebakeUserSessionCookie(context.userId);
    }
    return { ok: true };
  });

async function rebakeUserSessionCookie(userId: string): Promise<void> {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  const { signJwt } = await import("@/auth/crypto");
  const { buildAuthCookie } = await import("@/auth/cookies.server");
  const { getEnv } = await import("@/db/env.server");
  const { getOrganization, listMyOrganizations } = await import("@/lib/orgs.server");
  const db = getDB();
  const row = await db
    .prepare(
      "SELECT id, email, role, coach_persona_slug, system_prompt FROM users WHERE id = ?",
    )
    .bind(userId)
    .first<{
      id: string;
      email: string;
      role: "admin" | "manager" | "rep";
      coach_persona_slug: string | null;
      system_prompt: string | null;
    }>();
  if (!row) return;
  const orgs = await listMyOrganizations(userId);
  const currentOrgId = orgs[0]?.id;
  const orgSystemPrompt = currentOrgId
    ? (await getOrganization(currentOrgId))?.system_prompt ?? null
    : null;
  const SESSION_TTL_SEC = 60 * 60 * 24 * 7;
  const env = getEnv();
  const token = await signJwt(
    {
      sub: row.id,
      email: row.email,
      role: row.role,
      current_org_id: currentOrgId,
      coach_persona_slug: row.coach_persona_slug,
      org_system_prompt: orgSystemPrompt,
      user_system_prompt: row.system_prompt,
    },
    env.JWT_SECRET,
    SESSION_TTL_SEC,
  );
  setResponseHeader("set-cookie", buildAuthCookie(token, SESSION_TTL_SEC));
}

export const getIngestInfo = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => ({ hasSecret: true }));

// ────────────────────────────────── tickets ──────────────────────────────────

export const listTickets = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    // Tickets use `assigned_to`, not `owner_id`, so we build the per-rep clause inline.
    const isAdmin = isAdminOrManager(context.role);
    const own = isAdmin ? { sql: "1=1", params: [] as unknown[] } : { sql: "t.assigned_to = ?", params: [context.userId] };
    const org = orgClause(context.currentOrgId, "t.org_id");
    const where = andWhere(
      { sql: org.sql, params: org.params },
      own,
    );
    const rows = (await getDB().prepare(
      `SELECT t.*, c.full_name AS contact_full_name, c.email AS contact_email
       FROM tickets t LEFT JOIN contacts c ON c.id = t.contact_id
       WHERE ${where.sql}
       ORDER BY t.created_at DESC`,
    ).bind(...where.params).all<any>()).results;
    return rows.map((r: any) => ({
      ...r,
      contact: r.contact_id ? { full_name: r.contact_full_name, email: r.contact_email } : null,
    }));
  });

export const getTicket = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    const ticketRow = await db.prepare(
      `SELECT t.*, c.id AS c_id, c.full_name AS c_full_name, c.email AS c_email
       FROM tickets t LEFT JOIN contacts c ON c.id = t.contact_id WHERE t.id = ?`,
    ).bind(data.id).first<any>();
    const comments = (await db.prepare(
      `SELECT * FROM ticket_comments WHERE ticket_id = ? ORDER BY created_at ASC`,
    ).bind(data.id).all<any>()).results;
    const users = (await db.prepare(
      `SELECT id, full_name, avatar_url FROM users`,
    ).all<{ id: string; full_name: string | null; avatar_url: string | null }>()).results;
    const userMap = new Map(users.map((u) => [u.id, u]));
    const enrichedComments = comments.map((c: any) => ({ ...c, author: c.author_id ? userMap.get(c.author_id) ?? null : null }));
    if (!ticketRow) return { ticket: null, comments: enrichedComments };
    const assignee = ticketRow.assigned_to ? userMap.get(ticketRow.assigned_to) ?? null : null;
    const creator = ticketRow.created_by ? userMap.get(ticketRow.created_by) ?? null : null;
    return {
      ticket: {
        ...ticketRow,
        contact: ticketRow.c_id ? { id: ticketRow.c_id, full_name: ticketRow.c_full_name, email: ticketRow.c_email } : null,
        assignee, creator,
      },
      comments: enrichedComments,
    };
  });

export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { subject: string; description?: string; priority?: "low"|"medium"|"high"|"urgent"; contact_id?: string | null; assigned_to?: string | null }) =>
    z.object({
      subject: z.string().min(3).max(200),
      description: z.string().max(5000).optional(),
      priority: z.enum(["low","medium","high","urgent"]).optional(),
      contact_id: z.string().uuid().nullable().optional(),
      assigned_to: z.string().uuid().nullable().optional(),
    }).parse(d))
  .handler(async ({ context, data }) => {
    const id = uuid();
    const createdAt = now();
    const priority = data.priority ?? "medium";
    const sla = slaDueAt(priority, createdAt);
    const assigned = data.assigned_to ?? context.userId;
    const db = getDB();
    await db.prepare(
      `INSERT INTO tickets (id, subject, description, priority, status, contact_id, assigned_to, created_by, sla_due_at, created_at, org_id)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
    ).bind(id, data.subject, data.description ?? null, priority, data.contact_id ?? null, assigned, context.userId, sla, createdAt, context.currentOrgId ?? null).run();
    const row = await db.prepare("SELECT * FROM tickets WHERE id = ?").bind(id).first<any>();
    if (row?.org_id) {
      emitWebhookEvent(row.org_id, "ticket.created", { ticket: row });
    }
    return row ?? null;
  });

export const updateTicket = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string; status?: "open"|"pending"|"resolved"|"closed"; priority?: "low"|"medium"|"high"|"urgent"; assigned_to?: string | null; resolution_note?: string }) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["open","pending","resolved","closed"]).optional(),
      priority: z.enum(["low","medium","high","urgent"]).optional(),
      assigned_to: z.string().uuid().nullable().optional(),
      resolution_note: z.string().max(2000).optional(),
    }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    const pre = await db
      .prepare("SELECT org_id, status FROM tickets WHERE id = ?")
      .bind(data.id)
      .first<{ org_id: string | null; status: "open" | "pending" | "resolved" | "closed" }>();
    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.status !== undefined)          { fields.push("status = ?");          values.push(data.status); }
    if (data.priority !== undefined)        { fields.push("priority = ?");        values.push(data.priority); }
    if (data.assigned_to !== undefined)     { fields.push("assigned_to = ?");     values.push(data.assigned_to); }
    if (data.resolution_note !== undefined) { fields.push("resolution_note = ?"); values.push(data.resolution_note); }
    if (data.status === "resolved") { fields.push("resolved_at = ?"); values.push(now()); }
    else if (data.status) { fields.push("resolved_at = NULL"); }
    if (fields.length === 0) return { ok: true };
    values.push(data.id);
    await db.prepare(`UPDATE tickets SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    if (pre?.org_id && data.status !== undefined && data.status !== pre.status) {
      emitWebhookEvent(pre.org_id, "ticket.status_changed", {
        ticket_id: data.id,
        from_status: pre.status,
        to_status: data.status,
      });
      if (data.status === "resolved") {
        const row = await db
          .prepare("SELECT * FROM tickets WHERE id = ?")
          .bind(data.id)
          .first<{ id: string } & Record<string, unknown>>();
        if (row) emitWebhookEvent(pre.org_id, "ticket.resolved", { ticket: row });
      }
    }
    return { ok: true };
  });

export const addTicketComment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { ticket_id: string; body: string; is_internal?: boolean }) =>
    z.object({
      ticket_id: z.string().uuid(),
      body: z.string().min(1).max(5000),
      is_internal: z.boolean().optional(),
    }).parse(d))
  .handler(async ({ context, data }) => {
    await getDB().prepare(
      `INSERT INTO ticket_comments (id, ticket_id, body, is_internal, author_id) VALUES (?, ?, ?, ?, ?)`,
    ).bind(uuid(), data.ticket_id, data.body, data.is_internal ? 1 : 0, context.userId).run();
    return { ok: true };
  });

export const listAssignableUsers = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    // Org-scoped so a multi-org workspace never reveals another org's members
    // in the assignee picker. Falls back to "just me" before onboarding binds
    // an org so the picker still has a valid value.
    if (!context.currentOrgId) {
      return (await getDB().prepare(
        `SELECT id, full_name, avatar_url FROM users WHERE id = ? ORDER BY full_name`,
      ).bind(context.userId).all<{ id: string; full_name: string | null; avatar_url: string | null }>()).results;
    }
    return (await getDB().prepare(
      `SELECT u.id, u.full_name, u.avatar_url
       FROM organization_members m JOIN users u ON u.id = m.user_id
       WHERE m.org_id = ?
       ORDER BY u.full_name`,
    ).bind(context.currentOrgId).all<{ id: string; full_name: string | null; avatar_url: string | null }>()).results;
  });

// ────────────────────────────────── tasks ──────────────────────────────────

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const own = ownerClause(context.role, context.userId);
    const org = orgClause(context.currentOrgId);
    const where = andWhere(
      { sql: org.sql, params: org.params },
      { sql: own.sql, params: own.params },
    );
    return (await getDB().prepare(
      `SELECT * FROM tasks WHERE ${where.sql} ORDER BY due_at IS NULL, due_at ASC`,
    ).bind(...where.params).all<any>()).results;
  });

export const toggleTask = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string; completed: boolean }) =>
    z.object({ id: z.string().uuid(), completed: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    await db.prepare(`UPDATE tasks SET completed = ? WHERE id = ?`).bind(data.completed ? 1 : 0, data.id).run();
    if (data.completed) {
      const t = await db.prepare(`SELECT related_contact_id FROM tasks WHERE id = ?`).bind(data.id).first<{ related_contact_id: string | null }>();
      if (t?.related_contact_id) await maybeAdvanceStage(t.related_contact_id);
    }
    return { ok: true };
  });

export const createContactTask = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { contact_id: string; title: string; priority?: string; due_at?: string | null }) =>
    z.object({
      contact_id: z.string().uuid(),
      title: z.string().min(1).max(200),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      due_at: z.string().nullable().optional(),
    }).parse(d))
  .handler(async ({ context, data }) => {
    const id = uuid();
    await getDB().prepare(
      `INSERT INTO tasks (id, title, priority, owner_id, related_contact_id, due_at, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, data.title, data.priority ?? "medium", context.userId, data.contact_id, data.due_at ?? null, context.currentOrgId ?? null).run();
    return { id };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await getDB().prepare(`DELETE FROM tasks WHERE id = ?`).bind(data.id).run();
    return { ok: true };
  });

// ────────────────────────────────── activities ──────────────────────────────────

export const listActivities = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const org = orgClause(context.currentOrgId, "a.org_id");
    const rows = (await getDB().prepare(
      `SELECT a.*, c.full_name AS contact_full_name FROM activities a LEFT JOIN contacts c ON c.id = a.contact_id
       WHERE ${org.sql}
       ORDER BY a.occurred_at DESC LIMIT 100`,
    ).bind(...org.params).all<any>()).results;
    return rows.map((r: any) => ({ ...r, contact: r.contact_id ? { full_name: r.contact_full_name } : null }));
  });

export const logActivity = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { type: string; subject: string; body?: string; contact_id?: string | null; deal_id?: string | null }) =>
    z.object({
      type: z.enum(["call","email","note","meeting","system","signal"]),
      subject: z.string().min(1).max(200),
      body: z.string().max(5000).optional(),
      contact_id: z.string().uuid().nullable().optional(),
      deal_id: z.string().uuid().nullable().optional(),
    }).parse(d))
  .handler(async ({ context, data }) => {
    const db = getDB();
    await db.prepare(
      `INSERT INTO activities (id, type, subject, body, contact_id, deal_id, owner_id, org_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(uuid(), data.type, data.subject, data.body ?? null, data.contact_id ?? null, data.deal_id ?? null, context.userId, context.currentOrgId ?? null).run();
    if (data.type === "meeting" && data.contact_id) {
      await db.prepare(
        `UPDATE contacts SET relationship_stage = 'customer', stage_entered_at = ?
         WHERE id = ? AND relationship_stage <> 'customer'`,
      ).bind(now(), data.contact_id).run();
    }
    return { ok: true };
  });

// ────────────────────────────────── demo: fire test event ──────────────────────────────────

// On-camera MUST #4 affordance. Inserts a synthetic `signal` activity against
// the given contact in the caller's org. Mirrors what /api/public/ingest does
// from outside the trust boundary — the difference is no HMAC and no contact
// upsert, since the rep already has the contact open.
export const fireTestActivity = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { contact_id: string }) =>
    z.object({ contact_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = getDB();
    const owner = await db
      .prepare("SELECT org_id FROM contacts WHERE id = ?")
      .bind(data.contact_id)
      .first<{ org_id: string | null }>();
    if (!owner) throw new Error("Contact not found");
    if (owner.org_id && context.currentOrgId && owner.org_id !== context.currentOrgId) {
      throw new Error("Forbidden");
    }
    await db
      .prepare(
        `INSERT INTO activities (id, type, subject, body, contact_id, org_id, owner_id, occurred_at)
         VALUES (?, 'signal', ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .bind(
        uuid(),
        "Test event — fired from CRM",
        "Triggered by rep via 'Fire test event' button (MUST #4 demo).",
        data.contact_id,
        owner.org_id,
        context.userId,
      )
      .run();
    return { ok: true };
  });

// ────────────────────────────────── relationships (top-level entity) ──────────────────────────────────

// Relationship status taxonomy — must match CHECK constraint in 0013_relationship_status_check.sql.
// Cups 4-8 are derived in app code from the primary deal's kanban stage.
export const CUP_STATUSES = [
  "new", "stale", "lead", "discovery", "budget_confirmed", "customer",
] as const;

export type CupStatus = typeof CUP_STATUSES[number];

export const CUP_STATUS_LABELS: Record<CupStatus, string> = {
  new:              "New",
  stale:            "Stale",
  lead:             "Lead",
  discovery:        "Discovery",
  budget_confirmed: "Budget Confirmed",
  customer:         "Customer",
};

export const CUP_STATUS_NUMBER: Record<CupStatus, number> = {
  new: 0, stale: 0, lead: 1, discovery: 2, budget_confirmed: 3, customer: 9,
};

export const getOrCreateRelationshipForContact = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { contactId: string }) => z.object({ contactId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const db = getDB();
    const existing = await db.prepare(
      `SELECT r.id FROM relationships r
       JOIN relationship_contacts rc ON rc.relationship_id = r.id
       WHERE rc.contact_id = ? AND rc.role = 'primary' LIMIT 1`,
    ).bind(data.contactId).first<{ id: string }>();
    if (existing) return { relationshipId: existing.id };

    const contact = await db.prepare(
      `SELECT id, full_name, company_id, owner_id, org_id FROM contacts WHERE id = ?`,
    ).bind(data.contactId).first<any>();
    if (!contact) throw new Error("Contact not found");

    const relId = uuid();
    await db.prepare(
      `INSERT INTO relationships (id, name, status, owner_id, org_id) VALUES (?, ?, 'new', ?, ?)`,
    ).bind(relId, contact.full_name, contact.owner_id ?? context.userId, contact.org_id ?? context.currentOrgId).run();

    await db.prepare(
      `INSERT INTO relationship_contacts (id, relationship_id, contact_id, role) VALUES (?, ?, ?, 'primary')`,
    ).bind(uuid(), relId, data.contactId).run();

    if (contact.company_id) {
      await db.prepare(
        `INSERT INTO relationship_companies (id, relationship_id, company_id, role) VALUES (?, ?, ?, 'primary')`,
      ).bind(uuid(), relId, contact.company_id).run();
    }

    const topDeal = await db.prepare(
      `SELECT id FROM deals WHERE contact_id = ? ORDER BY created_at DESC LIMIT 1`,
    ).bind(data.contactId).first<{ id: string }>();
    if (topDeal) {
      await db.prepare(
        `INSERT INTO relationship_deals (id, relationship_id, deal_id, role) VALUES (?, ?, ?, 'primary')`,
      ).bind(uuid(), relId, topDeal.id).run();
    }

    return { relationshipId: relId };
  });

export const getRelationship = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    const rel = await db.prepare(`SELECT * FROM relationships WHERE id = ?`).bind(data.id).first<any>();
    if (!rel) return null;

    const [contacts, companies, deals, notes] = await Promise.all([
      db.prepare(
        `SELECT rc.role, c.id, c.full_name, c.title, c.email, c.phone,
                co.id AS co_id, co.name AS co_name, co.domain AS co_domain
         FROM relationship_contacts rc
         JOIN contacts c ON c.id = rc.contact_id
         LEFT JOIN companies co ON co.id = c.company_id
         WHERE rc.relationship_id = ?
         ORDER BY (rc.role = 'primary') DESC, rc.created_at ASC`,
      ).bind(data.id).all<any>(),
      db.prepare(
        `SELECT rc.role, co.id, co.name, co.domain, co.industry, co.employee_count
         FROM relationship_companies rc
         JOIN companies co ON co.id = rc.company_id
         WHERE rc.relationship_id = ?
         ORDER BY (rc.role = 'primary') DESC, rc.created_at ASC`,
      ).bind(data.id).all<any>(),
      db.prepare(
        `SELECT rd.role, d.id, d.name, d.value, d.stage, d.probability
         FROM relationship_deals rd
         JOIN deals d ON d.id = rd.deal_id
         WHERE rd.relationship_id = ?
         ORDER BY (rd.role = 'primary') DESC, rd.created_at ASC`,
      ).bind(data.id).all<any>(),
      db.prepare(
        `SELECT * FROM relationship_notes WHERE relationship_id = ?
         ORDER BY pinned DESC, created_at DESC`,
      ).bind(data.id).all<any>(),
    ]);

    const contactIds = contacts.results.map((c: any) => c.id);
    let activities: any[] = [];
    if (contactIds.length > 0) {
      const ph = contactIds.map(() => "?").join(",");
      activities = (await db.prepare(
        `SELECT * FROM activities WHERE contact_id IN (${ph}) ORDER BY occurred_at DESC LIMIT 50`,
      ).bind(...contactIds).all<any>()).results;
    }

    return {
      ...rel,
      contacts: contacts.results.map((c: any) => ({
        ...c,
        company: c.co_id ? { id: c.co_id, name: c.co_name, domain: c.co_domain } : null,
      })),
      companies: companies.results,
      deals: deals.results,
      notes: notes.results,
      activities,
    };
  });

export const updateRelationshipCupStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string; cupStatus: string }) =>
    z.object({ id: z.string().uuid(), cupStatus: z.enum(CUP_STATUSES) }).parse(d))
  .handler(async ({ data }) => {
    await getDB().prepare(`UPDATE relationships SET status = ? WHERE id = ?`).bind(data.cupStatus, data.id).run();
    return { ok: true };
  });

export const archiveRelationship = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await getDB().prepare(`UPDATE relationships SET archived_at = ? WHERE id = ?`).bind(now(), data.id).run();
    return { ok: true };
  });

export const deleteRelationship = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await getDB().prepare(`DELETE FROM relationships WHERE id = ?`).bind(data.id).run();
    return { ok: true };
  });

export const addRelationshipContact = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { relationshipId: string; contactId: string; role: "primary" | "secondary" }) =>
    z.object({
      relationshipId: z.string().uuid(),
      contactId: z.string().uuid(),
      role: z.enum(["primary", "secondary"]),
    }).parse(d))
  .handler(async ({ data }) => {
    await getDB().prepare(
      `INSERT OR IGNORE INTO relationship_contacts (id, relationship_id, contact_id, role) VALUES (?, ?, ?, ?)`,
    ).bind(uuid(), data.relationshipId, data.contactId, data.role).run();
    return { ok: true };
  });

export const removeRelationshipContact = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { relationshipId: string; contactId: string }) =>
    z.object({ relationshipId: z.string().uuid(), contactId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await getDB().prepare(
      `DELETE FROM relationship_contacts WHERE relationship_id = ? AND contact_id = ?`,
    ).bind(data.relationshipId, data.contactId).run();
    return { ok: true };
  });

export const addRelationshipCompany = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { relationshipId: string; companyId: string; role: "primary" | "secondary" }) =>
    z.object({
      relationshipId: z.string().uuid(),
      companyId: z.string().uuid(),
      role: z.enum(["primary", "secondary"]),
    }).parse(d))
  .handler(async ({ data }) => {
    await getDB().prepare(
      `INSERT OR IGNORE INTO relationship_companies (id, relationship_id, company_id, role) VALUES (?, ?, ?, ?)`,
    ).bind(uuid(), data.relationshipId, data.companyId, data.role).run();
    return { ok: true };
  });

export const removeRelationshipCompany = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { relationshipId: string; companyId: string }) =>
    z.object({ relationshipId: z.string().uuid(), companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await getDB().prepare(
      `DELETE FROM relationship_companies WHERE relationship_id = ? AND company_id = ?`,
    ).bind(data.relationshipId, data.companyId).run();
    return { ok: true };
  });

export const addRelationshipDeal = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { relationshipId: string; dealId: string; role: "primary" | "secondary" }) =>
    z.object({
      relationshipId: z.string().uuid(),
      dealId: z.string().uuid(),
      role: z.enum(["primary", "secondary"]),
    }).parse(d))
  .handler(async ({ data }) => {
    await getDB().prepare(
      `INSERT OR IGNORE INTO relationship_deals (id, relationship_id, deal_id, role) VALUES (?, ?, ?, ?)`,
    ).bind(uuid(), data.relationshipId, data.dealId, data.role).run();
    return { ok: true };
  });

export const removeRelationshipDeal = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { relationshipId: string; dealId: string }) =>
    z.object({ relationshipId: z.string().uuid(), dealId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await getDB().prepare(
      `DELETE FROM relationship_deals WHERE relationship_id = ? AND deal_id = ?`,
    ).bind(data.relationshipId, data.dealId).run();
    return { ok: true };
  });

export const createAndAddRelationshipDeal = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { relationshipId: string; name: string; value: number; role: "primary" | "secondary" }) =>
    z.object({
      relationshipId: z.string().uuid(),
      name: z.string().min(1).max(200),
      value: z.number().min(0),
      role: z.enum(["primary", "secondary"]),
    }).parse(d))
  .handler(async ({ context, data }) => {
    const db = getDB();
    const dealId = uuid();
    await db.prepare(
      `INSERT INTO deals (id, name, value, stage, owner_id, org_id) VALUES (?, ?, ?, 'discovery', ?, ?)`,
    ).bind(dealId, data.name, data.value, context.userId, context.currentOrgId).run();
    await db.prepare(
      `INSERT OR IGNORE INTO relationship_deals (id, relationship_id, deal_id, role) VALUES (?, ?, ?, ?)`,
    ).bind(uuid(), data.relationshipId, dealId, data.role).run();
    return { ok: true, dealId };
  });

export const createRelationshipNote = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { relationshipId: string; title?: string; body: string; pinned?: boolean }) =>
    z.object({
      relationshipId: z.string().uuid(),
      title: z.string().max(200).optional(),
      body: z.string().min(1).max(10000),
      pinned: z.boolean().optional(),
    }).parse(d))
  .handler(async ({ context, data }) => {
    const db = getDB();
    const rel = await db.prepare(`SELECT org_id FROM relationships WHERE id = ?`).bind(data.relationshipId).first<{ org_id: string | null }>();
    const id = uuid();
    await db.prepare(
      `INSERT INTO relationship_notes (id, relationship_id, title, body, pinned, owner_id, org_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, data.relationshipId, data.title ?? null, data.body, data.pinned ? 1 : 0, context.userId, rel?.org_id ?? null).run();
    return { ok: true, id };
  });

export const deleteRelationshipNote = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await getDB().prepare(`DELETE FROM relationship_notes WHERE id = ?`).bind(data.id).run();
    return { ok: true };
  });

export const logRelationshipActivity = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { relationshipId: string; subject: string; body?: string }) =>
    z.object({
      relationshipId: z.string().uuid(),
      subject: z.string().min(1).max(200),
      body: z.string().max(5000).optional(),
    }).parse(d))
  .handler(async ({ context, data }) => {
    const db = getDB();
    const primary = await db.prepare(
      `SELECT contact_id FROM relationship_contacts WHERE relationship_id = ? AND role = 'primary' LIMIT 1`,
    ).bind(data.relationshipId).first<{ contact_id: string }>();
    await db.prepare(
      `INSERT INTO activities (id, type, subject, body, contact_id, owner_id) VALUES (?, 'note', ?, ?, ?, ?)`,
    ).bind(uuid(), data.subject, data.body ?? null, primary?.contact_id ?? null, context.userId).run();
    return { ok: true };
  });

// ────────────────────────────────── seed ──────────────────────────────────

export const seedDemo = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const db = getDB();
    const count = await db.prepare("SELECT COUNT(*) AS n FROM contacts").first<{ n: number }>();
    if ((count?.n ?? 0) > 0) return { seeded: false };

    const companiesSeed = [
      { id: uuid(), name: "Acme Corp",        domain: "acme.com",    industry: "SaaS",          location: "Portland, OR",      employee_count: 542 },
      { id: uuid(), name: "Stellar Systems",  domain: "stellar.io",  industry: "Infrastructure",location: "Seattle, WA",       employee_count: 230 },
      { id: uuid(), name: "Orbit Logic",      domain: "orbit.dev",   industry: "Fintech",       location: "San Francisco, CA", employee_count: 89  },
      { id: uuid(), name: "Nexa Systems",     domain: "nexa.tech",   industry: "Cybersecurity", location: "Austin, TX",        employee_count: 410 },
      { id: uuid(), name: "Helix Lab",        domain: "helix.bio",   industry: "Biotech",       location: "Boston, MA",        employee_count: 67  },
      { id: uuid(), name: "Quantum Pay",      domain: "qpay.co",     industry: "Payments",      location: "New York, NY",      employee_count: 178 },
    ];
    for (const c of companiesSeed) {
      await db.prepare(
        `INSERT INTO companies (id, name, domain, industry, location, employee_count, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(c.id, c.name, c.domain, c.industry, c.location, c.employee_count, context.userId).run();
    }

    const contactsSeed = [
      { full_name: "Sarah Chen",      title: "VP Engineering",    co: 0, ideal: 1 },
      { full_name: "Marcus Aurelius", title: "VP of Engineering", co: 1, ideal: 1 },
      { full_name: "Priya Patel",     title: "Head of RevOps",    co: 2, ideal: 0 },
      { full_name: "Jordan Reeves",   title: "CTO",               co: 3, ideal: 1 },
      { full_name: "Diego Alvarez",   title: "Director of IT",    co: 4, ideal: 0 },
      { full_name: "Mei Tanaka",      title: "CFO",               co: 5, ideal: 0 },
      { full_name: "Robin Hayes",     title: "Product Lead",      co: 0, ideal: 0 },
      { full_name: "Sam O'Neill",     title: "Security Lead",     co: 3, ideal: 0 },
    ];
    const stagePlan: RelStage[] = ["lead","lead","contact","contact","deal","deal","customer","lead"];
    const contactIds: string[] = [];
    for (let i = 0; i < contactsSeed.length; i++) {
      const c = contactsSeed[i];
      const id = uuid();
      contactIds.push(id);
      const stageEntered = new Date(Date.now() - [1,5,2,11,4,9,30,8][i] * 86400e3).toISOString();
      const email = c.full_name.toLowerCase().replace(/[^a-z]/g, ".") + "@" + companiesSeed[c.co].domain;
      await db.prepare(
        `INSERT INTO contacts (id, full_name, title, email, company_id, owner_id, is_ideal_customer, relationship_stage, stage_entered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, c.full_name, c.title, email, companiesSeed[c.co].id, context.userId, c.ideal, stagePlan[i], stageEntered).run();
      await seedStageTasks(id, context.userId, stagePlan[i], c.full_name, context.currentOrgId ?? null);
    }

    const completeOne = async (contactIdx: number, stageKey: string) => {
      await db.prepare(`UPDATE tasks SET completed = 1 WHERE related_contact_id = ? AND stage_key = ?`)
        .bind(contactIds[contactIdx], stageKey).run();
    };
    await completeOne(0, "lead:drip");
    await completeOne(2, "contact:discovery");
    await completeOne(4, "deal:proposal");

    const dealsSeed = [
      { name: "Acme Corp — Enterprise expansion", stage: "closing",   value: 92000,  co: 0, ct: 0 },
      { name: "Stellar Systems — Q4 platform",    stage: "proposal",  value: 210000, co: 1, ct: 1 },
      { name: "Orbit Logic — Pilot",              stage: "qualified", value: 45000,  co: 2, ct: 2 },
      { name: "Nexa SSO rollout",                 stage: "discovery", value: 22000,  co: 3, ct: 3 },
      { name: "Helix Lab — Research seats",       stage: "proposal",  value: 68000,  co: 4, ct: 4 },
      { name: "Quantum Pay — Annual",             stage: "qualified", value: 142000, co: 5, ct: 5 },
      { name: "Acme — Add-on integrations",       stage: "discovery", value: 18000,  co: 0, ct: 6 },
      { name: "Nexa — Compliance bundle",         stage: "won",       value: 56000,  co: 3, ct: 7 },
    ] as const;
    for (let i = 0; i < dealsSeed.length; i++) {
      const d = dealsSeed[i];
      const probability = d.stage === "closing" ? 80 : d.stage === "proposal" ? 60 : 30;
      await db.prepare(
        `INSERT INTO deals (id, name, stage, value, company_id, contact_id, owner_id, probability, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(uuid(), d.name, d.stage, d.value, companiesSeed[d.co].id, contactIds[d.ct], context.userId, probability, i).run();
    }

    const leadsSeed = [
      { source: "website",  status: "new",        score: 82, ltv: 45000  },
      { source: "referral", status: "contacted",  score: 64, ltv: 18000  },
      { source: "outbound", status: "qualified",  score: 91, ltv: 120000 },
      { source: "event",    status: "new",        score: 45, ltv: 8000   },
      { source: "linkedin", status: "contacted",  score: 73, ltv: 32000  },
    ] as const;
    for (let i = 0; i < leadsSeed.length; i++) {
      const l = leadsSeed[i];
      await db.prepare(
        `INSERT INTO leads (id, contact_id, owner_id, source, status, score, estimated_ltv) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(uuid(), contactIds[i], context.userId, l.source, l.status, l.score, l.ltv).run();
    }

    const activitiesSeed = [
      { type: "email",   subject: "Sent proposal: Q4 Expansion Deck",      ct: 0, ago_ms: 2*3600e3 },
      { type: "signal",  subject: "4 stakeholders viewed pricing page",    ct: 1, ago_ms: 30*60e3 },
      { type: "call",    subject: "Discovery call with Priya",             ct: 2, ago_ms: 6*3600e3 },
      { type: "meeting", subject: "Demo with Nexa security team",          ct: 3, ago_ms: 26*3600e3 },
      { type: "note",    subject: "Pricing concerns to address",           ct: 4, ago_ms: 2*86400e3 },
    ] as const;
    for (const a of activitiesSeed) {
      await db.prepare(
        `INSERT INTO activities (id, type, subject, contact_id, owner_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(uuid(), a.type, a.subject, contactIds[a.ct], context.userId, new Date(Date.now() - a.ago_ms).toISOString()).run();
    }

    await db.prepare(`INSERT INTO purchases (id, contact_id, amount, product) VALUES (?, ?, ?, ?)`)
      .bind(uuid(), contactIds[7], 56000, "Compliance bundle").run();
    await db.prepare(`INSERT INTO purchases (id, contact_id, amount, product) VALUES (?, ?, ?, ?)`)
      .bind(uuid(), contactIds[0], 14000, "Initial seats").run();

    const ticketsSeed = [
      { subject: "API rate limits hitting on bulk import", desc: "Customer reports 429s", status: "open" as const,    priority: "high" as const,   ct: 0, sla_offset_ms: -2*3600e3 },
      { subject: "SSO config request",                     desc: "Wants Okta SAML",       status: "pending" as const, priority: "medium" as const, ct: 3, sla_offset_ms: 24*3600e3 },
      { subject: "Billing question",                       desc: "Invoice mismatch",      status: "open" as const,    priority: "low" as const,    ct: 5, sla_offset_ms: 48*3600e3 },
    ];
    for (const t of ticketsSeed) {
      await db.prepare(
        `INSERT INTO tickets (id, subject, description, status, priority, contact_id, assigned_to, created_by, sla_due_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(uuid(), t.subject, t.desc, t.status, t.priority, contactIds[t.ct], context.userId, context.userId, new Date(Date.now() + t.sla_offset_ms).toISOString()).run();
    }

    const tasksSeed = [
      { title: "Finalize Proposal: Acme Corp",  desc: "Contract expires in 48 hours. Redline received.", priority: "urgent" as const, due_ms: 12*3600e3 },
      { title: "Follow up with Sarah Chen",     desc: "Initial demo successful. Ready for seat pricing.", priority: "high" as const,  due_ms: 24*3600e3 },
      { title: "Onboard Nexa Systems",          desc: "Signed MSA. Verify SSO integration.",              priority: "medium" as const, due_ms: 3*86400e3 },
      { title: "Send pricing to Quantum Pay",   desc: null as string | null,                              priority: "medium" as const, due_ms: 2*86400e3 },
      { title: "Weekly pipeline review",        desc: null as string | null,                              priority: "low" as const,    due_ms: 5*86400e3 },
    ];
    for (const t of tasksSeed) {
      await db.prepare(
        `INSERT INTO tasks (id, title, description, priority, owner_id, due_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(uuid(), t.title, t.desc, t.priority, context.userId, new Date(Date.now() + t.due_ms).toISOString()).run();
    }

    return { seeded: true };
  });

// ─────────────────────── relationships (new wrapper table) ───────────────────────
// These functions operate on the `relationships` table introduced in 0007.
// They co-exist with the legacy `getRelationships` above (which still synthesizes
// "relationships" from contacts via relationship_stage) until the UI migrates.
// Status taxonomy is not yet locked — schemas accept free-text status.

export const listRelationshipRecords = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const db = getDB();
    const own = ownerClause(context.role, context.userId);
    const rows = (await db.prepare(
      `SELECT r.id, r.name, r.status, r.status_entered_at, r.owner_id, r.org_id,
              r.notes, r.archived_at, r.created_at
       FROM relationships r
       WHERE r.archived_at IS NULL AND ${own.sql.replace(/owner_id/g, "r.owner_id")}
       ORDER BY r.status_entered_at DESC`,
    ).bind(...own.params).all<any>()).results;
    return rows;
  });

export const getRelationshipRecord = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    const rel = await db.prepare(
      `SELECT id, name, status, status_entered_at, owner_id, org_id, notes,
              archived_at, created_at
       FROM relationships WHERE id = ?`,
    ).bind(data.id).first<any>();
    if (!rel) return null;
    const contacts = (await db.prepare(
      `SELECT rc.contact_id, rc.role, rc.is_primary,
              c.full_name, c.email, c.title, c.company_id
       FROM relationship_contacts rc
       JOIN contacts c ON c.id = rc.contact_id
       WHERE rc.relationship_id = ?`,
    ).bind(data.id).all<any>()).results;
    const companies = (await db.prepare(
      `SELECT rco.company_id, rco.role, rco.is_primary, co.name, co.domain
       FROM relationship_companies rco
       JOIN companies co ON co.id = rco.company_id
       WHERE rco.relationship_id = ?`,
    ).bind(data.id).all<any>()).results;
    const deals = (await db.prepare(
      `SELECT id, name, stage, value, probability, expected_close, owner_id, created_at
       FROM deals WHERE relationship_id = ?
       ORDER BY created_at DESC`,
    ).bind(data.id).all<any>()).results;
    return {
      ...rel,
      contacts: contacts.map((c: any) => ({ ...c, is_primary: Boolean(c.is_primary) })),
      companies: companies.map((c: any) => ({ ...c, is_primary: Boolean(c.is_primary) })),
      deals,
    };
  });

export const createRelationshipRecord = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: {
    name?: string;
    status?: string;
    owner_id?: string | null;
    notes?: string | null;
    initial_contact_id?: string;
    initial_company_id?: string;
  }) => z.object({
    name: z.string().min(1).max(200).optional(),
    status: z.string().min(1).optional(),
    owner_id: z.string().uuid().nullable().optional(),
    notes: z.string().nullable().optional(),
    initial_contact_id: z.string().uuid().optional(),
    initial_company_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const db = getDB();
    const id = uuid();
    // Infer org_id from initial contact or company if provided.
    let orgId: string | null = null;
    if (data.initial_contact_id) {
      const c = await db.prepare("SELECT org_id FROM contacts WHERE id = ?")
        .bind(data.initial_contact_id).first<{ org_id: string | null }>();
      orgId = c?.org_id ?? null;
    } else if (data.initial_company_id) {
      const co = await db.prepare("SELECT org_id FROM companies WHERE id = ?")
        .bind(data.initial_company_id).first<{ org_id: string | null }>();
      orgId = co?.org_id ?? null;
    }
    await db.prepare(
      `INSERT INTO relationships (id, org_id, name, status, owner_id, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      orgId,
      data.name ?? null,
      data.status ?? "prospecting",
      data.owner_id ?? context.userId,
      data.notes ?? null,
    ).run();
    let companyToAttach = data.initial_company_id ?? null;
    if (data.initial_contact_id) {
      await db.prepare(
        `INSERT INTO relationship_contacts (relationship_id, contact_id, org_id, is_primary)
         VALUES (?, ?, ?, 1)`,
      ).bind(id, data.initial_contact_id, orgId).run();
      // If no company explicitly provided, infer from the contact.
      if (!companyToAttach) {
        const c = await db.prepare("SELECT company_id FROM contacts WHERE id = ?")
          .bind(data.initial_contact_id).first<{ company_id: string | null }>();
        if (c?.company_id) companyToAttach = c.company_id;
      }
    }
    if (companyToAttach) {
      await db.prepare(
        `INSERT INTO relationship_companies (relationship_id, company_id, org_id, is_primary)
         VALUES (?, ?, ?, 1)`,
      ).bind(id, companyToAttach, orgId).run();
    }
    return await db.prepare("SELECT * FROM relationships WHERE id = ?").bind(id).first<any>();
  });

export const archiveRelationshipRecord = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    await db.prepare("UPDATE relationships SET archived_at = ? WHERE id = ?")
      .bind(now(), data.id).run();
    return { ok: true };
  });

export const attachContactToRelationship = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { relationship_id: string; contact_id: string; role?: string; is_primary?: boolean }) =>
    z.object({
      relationship_id: z.string().uuid(),
      contact_id: z.string().uuid(),
      role: z.string().max(64).optional(),
      is_primary: z.boolean().optional(),
    }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    const rel = await db.prepare("SELECT org_id FROM relationships WHERE id = ?")
      .bind(data.relationship_id).first<{ org_id: string | null }>();
    if (!rel) throw new Error("Relationship not found");
    // If setting this as primary, clear any existing primary for this relationship.
    if (data.is_primary) {
      await db.prepare(
        "UPDATE relationship_contacts SET is_primary = 0 WHERE relationship_id = ?",
      ).bind(data.relationship_id).run();
    }
    await db.prepare(
      `INSERT INTO relationship_contacts (relationship_id, contact_id, org_id, role, is_primary)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(relationship_id, contact_id) DO UPDATE SET
         role = excluded.role,
         is_primary = excluded.is_primary`,
    ).bind(
      data.relationship_id,
      data.contact_id,
      rel.org_id,
      data.role ?? null,
      data.is_primary ? 1 : 0,
    ).run();
    return { ok: true };
  });

export const detachContactFromRelationship = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { relationship_id: string; contact_id: string }) =>
    z.object({
      relationship_id: z.string().uuid(),
      contact_id: z.string().uuid(),
    }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    await db.prepare(
      "DELETE FROM relationship_contacts WHERE relationship_id = ? AND contact_id = ?",
    ).bind(data.relationship_id, data.contact_id).run();
    return { ok: true };
  });

export const attachCompanyToRelationship = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { relationship_id: string; company_id: string; role?: string; is_primary?: boolean }) =>
    z.object({
      relationship_id: z.string().uuid(),
      company_id: z.string().uuid(),
      role: z.string().max(64).optional(),
      is_primary: z.boolean().optional(),
    }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    const rel = await db.prepare("SELECT org_id FROM relationships WHERE id = ?")
      .bind(data.relationship_id).first<{ org_id: string | null }>();
    if (!rel) throw new Error("Relationship not found");
    if (data.is_primary) {
      await db.prepare(
        "UPDATE relationship_companies SET is_primary = 0 WHERE relationship_id = ?",
      ).bind(data.relationship_id).run();
    }
    await db.prepare(
      `INSERT INTO relationship_companies (relationship_id, company_id, org_id, role, is_primary)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(relationship_id, company_id) DO UPDATE SET
         role = excluded.role,
         is_primary = excluded.is_primary`,
    ).bind(
      data.relationship_id,
      data.company_id,
      rel.org_id,
      data.role ?? null,
      data.is_primary ? 1 : 0,
    ).run();
    return { ok: true };
  });

export const detachCompanyFromRelationship = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { relationship_id: string; company_id: string }) =>
    z.object({
      relationship_id: z.string().uuid(),
      company_id: z.string().uuid(),
    }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    await db.prepare(
      "DELETE FROM relationship_companies WHERE relationship_id = ? AND company_id = ?",
    ).bind(data.relationship_id, data.company_id).run();
    return { ok: true };
  });

// ─────────────────── cup derivation + status advancement ───────────────────
// Funnel display metric: how many "cups" deep is this relationship.
//   new/stale            -> 0 cups (off-funnel)
//   lead                 -> 1
//   discovery            -> 2
//   budget_confirmed     -> 3
//   deal stages 4-8 come from deals.stage (mapped below)
//   customer             -> 9 (won)

const RELATIONSHIP_CUPS: Record<string, number> = {
  new: 0,
  stale: 0,
  lead: 1,
  discovery: 2,
  budget_confirmed: 3,
  customer: 9,
};

// Map existing deal kanban stages to cups 4-8. We keep deals.stage values
// unchanged for the hackathon; this lookup translates to the funnel metric.
const DEAL_STAGE_CUPS: Record<string, number> = {
  discovery: 4,    // decision-maker / initial deal context
  qualified: 5,    // need validated
  proposal: 7,     // proposal sent
  closing: 8,      // negotiation
  won: 9,
  lost: 0,
};

function cupsForRelationship(
  status: string,
  dealStages: string[],
): number {
  const base = RELATIONSHIP_CUPS[status] ?? 0;
  // If any deal is won, the relationship is at customer (9).
  if (dealStages.some((s) => s === "won")) return 9;
  // Otherwise take the max of status cup and the open deals' cups.
  const openDeals = dealStages.filter((s) => s !== "won" && s !== "lost");
  const dealMax = openDeals.reduce((m, s) => Math.max(m, DEAL_STAGE_CUPS[s] ?? 0), 0);
  return Math.max(base, dealMax);
}

export const advanceRelationshipStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string; to_status: string }) =>
    z.object({
      id: z.string().uuid(),
      to_status: z.enum(["new", "stale", "lead", "discovery", "budget_confirmed", "customer"]),
    }).parse(d))
  .handler(async ({ data }) => {
    const db = getDB();
    const rel = await db.prepare("SELECT id, org_id, status FROM relationships WHERE id = ?")
      .bind(data.id)
      .first<{ id: string; org_id: string | null; status: string }>();
    if (!rel) throw new Error("Relationship not found");
    await db.prepare(
      "UPDATE relationships SET status = ?, status_entered_at = ? WHERE id = ?",
    ).bind(data.to_status, now(), data.id).run();
    if (rel.org_id) {
      emitWebhookEvent(rel.org_id, "relationship.status_changed", {
        relationship_id: data.id,
        from_status: rel.status,
        to_status: data.to_status,
      });
    }
    return { ok: true, from: rel.status, to: data.to_status };
  });

// Convenience read used by the funnel UI: list with cup count + primary
// contact/company hydrated in a single roundtrip.
export const listRelationshipsForFunnel = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const db = getDB();
    const own = ownerClause(context.role, context.userId);
    const rels = (await db.prepare(
      `SELECT r.id, r.name, r.status, r.status_entered_at, r.owner_id, r.created_at
       FROM relationships r
       WHERE r.archived_at IS NULL AND ${own.sql.replace(/owner_id/g, "r.owner_id")}
       ORDER BY r.status_entered_at DESC`,
    ).bind(...own.params).all<any>()).results;
    if (rels.length === 0) return [];
    const ids = rels.map((r: any) => r.id);
    const placeholders = ids.map(() => "?").join(",");
    const contactRows = (await db.prepare(
      `SELECT rc.relationship_id, c.full_name, c.email, c.title, rc.is_primary
       FROM relationship_contacts rc
       JOIN contacts c ON c.id = rc.contact_id
       WHERE rc.relationship_id IN (${placeholders})
       ORDER BY rc.is_primary DESC`,
    ).bind(...ids).all<any>()).results;
    const companyRows = (await db.prepare(
      `SELECT rco.relationship_id, co.name, co.domain, rco.is_primary
       FROM relationship_companies rco
       JOIN companies co ON co.id = rco.company_id
       WHERE rco.relationship_id IN (${placeholders})
       ORDER BY rco.is_primary DESC`,
    ).bind(...ids).all<any>()).results;
    const dealRows = (await db.prepare(
      `SELECT relationship_id, stage FROM deals WHERE relationship_id IN (${placeholders})`,
    ).bind(...ids).all<any>()).results;
    return rels.map((r: any) => {
      const contacts = contactRows.filter((c: any) => c.relationship_id === r.id);
      const companies = companyRows.filter((c: any) => c.relationship_id === r.id);
      const stages = dealRows
        .filter((d: any) => d.relationship_id === r.id)
        .map((d: any) => d.stage as string);
      return {
        ...r,
        primary_contact: contacts.find((c: any) => c.is_primary) ?? contacts[0] ?? null,
        primary_company: companies.find((c: any) => c.is_primary) ?? companies[0] ?? null,
        cups: cupsForRelationship(r.status, stages),
        open_deal_count: stages.filter((s) => s !== "won" && s !== "lost").length,
      };
    });
  });

// ────────────────────────────── enrichment ──────────────────────────────

export const enrichCompanyNow = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const row = await getDB()
      .prepare("SELECT org_id FROM companies WHERE id = ?")
      .bind(data.id)
      .first<{ org_id: string | null }>();
    refreshCompanyEnrichment(row?.org_id ?? context.currentOrgId, data.id);
    return { ok: true };
  });

export const enrichContactNow = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const row = await getDB()
      .prepare("SELECT org_id FROM contacts WHERE id = ?")
      .bind(data.id)
      .first<{ org_id: string | null }>();
    refreshContactEnrichment(row?.org_id ?? context.currentOrgId, data.id);
    return { ok: true };
  });

// ──────────────────────────── editable prompts ────────────────────────────

export const listOrgPrompts = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    if (!context.currentOrgId) return { prompts: [], defaults: DEFAULT_PROMPTS };
    const prompts = await listOrgPromptsForOrg(context.currentOrgId);
    return { prompts, defaults: DEFAULT_PROMPTS };
  });

export const upsertOrgPrompt = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { key: string; body: string }) =>
    z
      .object({
        key: z.enum(PROMPT_KEYS as unknown as [PromptKey, ...PromptKey[]]),
        body: z.string().max(20_000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    if (!context.currentOrgId) throw new Error("No active organization");
    if (!isAdminOrManager(context.role) && !context.isSuperAdmin) {
      throw new Error("Only admins or managers can edit prompts");
    }
    const db = getDB();
    await db
      .prepare(
        `INSERT INTO organization_prompts (org_id, prompt_key, body, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(org_id, prompt_key) DO UPDATE SET
           body = excluded.body,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`,
      )
      .bind(context.currentOrgId, data.key, data.body, now(), context.userId)
      .run();
    // The org_overlay prompt is also threaded into rep JWTs (read by the
    // backend agent worker), so keep organizations.system_prompt in sync
    // when the user edits it here.
    if (data.key === "org_overlay") {
      await db
        .prepare("UPDATE organizations SET system_prompt = ? WHERE id = ?")
        .bind(data.body.trim() ? data.body : null, context.currentOrgId)
        .run();
    }
    return { ok: true };
  });

export const resetOrgPrompt = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { key: string }) =>
    z
      .object({
        key: z.enum(PROMPT_KEYS as unknown as [PromptKey, ...PromptKey[]]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    if (!context.currentOrgId) throw new Error("No active organization");
    if (!isAdminOrManager(context.role) && !context.isSuperAdmin) {
      throw new Error("Only admins or managers can edit prompts");
    }
    const db = getDB();
    await db
      .prepare("DELETE FROM organization_prompts WHERE org_id = ? AND prompt_key = ?")
      .bind(context.currentOrgId, data.key)
      .run();
    if (data.key === "org_overlay") {
      await db
        .prepare("UPDATE organizations SET system_prompt = NULL WHERE id = ?")
        .bind(context.currentOrgId)
        .run();
    }
    return { ok: true };
  });

// ─────────────────────── enrichment kill switch ───────────────────────

export const getEnrichmentSettings = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    if (!context.currentOrgId) return { enabled: false };
    const row = await getDB()
      .prepare("SELECT enrichment_enabled FROM organizations WHERE id = ?")
      .bind(context.currentOrgId)
      .first<{ enrichment_enabled: number }>();
    return { enabled: (row?.enrichment_enabled ?? 1) === 1 };
  });

export const setEnrichmentEnabled = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { enabled: boolean }) =>
    z.object({ enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    if (!context.currentOrgId) throw new Error("No active organization");
    if (!isAdminOrManager(context.role) && !context.isSuperAdmin) {
      throw new Error("Only admins or managers can change this setting");
    }
    await getDB()
      .prepare("UPDATE organizations SET enrichment_enabled = ? WHERE id = ?")
      .bind(data.enabled ? 1 : 0, context.currentOrgId)
      .run();
    return { ok: true };
  });
