// Single owner of every D1 query the agentic backend issues. Routes call
// these helpers; never raw SQL anywhere else. Output is zod-validated at the
// boundary so a schema drift fails loud here, not 4 hops downstream inside the
// LLM's tool-call response.

import {
  Activity,
  Customer,
  Lead,
  type ActivityType,
  type ActivitySource,
  Ticket,
  type CustomerCreate,
  type CustomerPatch,
  type CustomerStatus,
  type LeadPatch,
  type LeadStage,
  type PrioritizedAction,
  type TicketPatch,
  type TicketStatus,
  ProspectAffinities,
  type ResearchJob,
  type ResearchJobStatus,
  type ResearchJobResult,
  type GiftDraft,
} from "@crema/shared";
import type { Env } from "./index";
import { publishCustomerEvent } from "./events";
import { SiteAdapterSchema, type SiteAdapter } from "./site-adapters";

const NOW = "2026-05-19T12:00:00.000Z";
const DAY_MS = 24 * 60 * 60 * 1000;

function isoNow(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  const r = (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${r}`;
}

function intToBool(n: unknown): boolean {
  return n === 1 || n === "1" || n === true;
}

function boolToInt(b: unknown): 0 | 1 {
  return b ? 1 : 0;
}

// ─── Row mappers ────────────────────────────────────────────────────────────

type CustomerRow = {
  id: string; name: string; email: string; phone: string | null;
  company_id: string | null; assigned_to: string; status: string;
  created_at: string; updated_at: string;
};
function mapCustomer(row: CustomerRow): Customer {
  return Customer.parse({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    companyId: row.company_id,
    assignedTo: row.assigned_to,
    status: row.status as CustomerStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

type LeadRow = {
  id: string; customer_id: string; stage: string;
  ltv_estimate: number; owner_id: string; created_at: string;
};
function mapLead(row: LeadRow): Lead {
  return Lead.parse({
    id: row.id,
    customerId: row.customer_id,
    stage: row.stage as LeadStage,
    ltvEstimate: row.ltv_estimate,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  });
}

type TicketRow = {
  id: string; customer_id: string; status: string; priority: string;
  sla_breached: number; summary: string; opened_at: string; closed_at: string | null;
};
function mapTicket(row: TicketRow): Ticket {
  return Ticket.parse({
    id: row.id,
    customerId: row.customer_id,
    status: row.status as TicketStatus,
    priority: row.priority as Ticket["priority"],
    slaBreached: intToBool(row.sla_breached),
    summary: row.summary,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
  });
}

type ActivityRow = {
  id: string; customer_id: string; type: string; body: string;
  source: string; actor_id: string; created_at: string;
};
function mapActivity(row: ActivityRow): Activity {
  return Activity.parse({
    id: row.id,
    customerId: row.customer_id,
    type: row.type as ActivityType,
    body: row.body,
    source: row.source as ActivitySource,
    actorId: row.actor_id,
    createdAt: row.created_at,
  });
}

// ─── Pagination helper (opaque createdAt+id cursor) ─────────────────────────

function encodeCursor(value: string): string {
  return btoa(value).replace(/=+$/, "");
}
function decodeCursor(cursor: string | undefined | null): number {
  if (!cursor) return 0;
  try {
    const n = Number(atob(cursor));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

// ─── Sales reps ─────────────────────────────────────────────────────────────

export async function listActiveReps(env: Env): Promise<Array<{ id: string; email: string }>> {
  const res = await env.DB.prepare(
    "SELECT id, email FROM sales_reps WHERE active = 1 ORDER BY id",
  ).all<{ id: string; email: string }>();
  return res.results ?? [];
}

// ─── Customers ──────────────────────────────────────────────────────────────

export async function listCustomers(
  env: Env,
  opts: { status?: CustomerStatus; q?: string; cursor?: string; limit?: number },
): Promise<{ items: Customer[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const offset = decodeCursor(opts.cursor);
  const filters: string[] = [];
  const args: unknown[] = [];
  if (opts.status) {
    filters.push("status = ?");
    args.push(opts.status);
  }
  if (opts.q) {
    filters.push("(lower(name) LIKE ? OR lower(email) LIKE ?)");
    const needle = `%${opts.q.toLowerCase()}%`;
    args.push(needle, needle);
  }
  const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
  const sql = `SELECT * FROM customers ${where} ORDER BY id LIMIT ? OFFSET ?`;
  const res = await env.DB
    .prepare(sql)
    .bind(...args, limit + 1, offset)
    .all<CustomerRow>();
  const rows = res.results ?? [];
  const items = rows.slice(0, limit).map(mapCustomer);
  const next = rows.length > limit ? encodeCursor(String(offset + limit)) : null;
  return { items, next_cursor: next };
}

export async function getCustomer(env: Env, id: string): Promise<Customer | null> {
  const row = await env.DB
    .prepare("SELECT * FROM customers WHERE id = ?")
    .bind(id)
    .first<CustomerRow>();
  return row ? mapCustomer(row) : null;
}

export async function findCustomerByEmail(env: Env, email: string): Promise<Customer | null> {
  const row = await env.DB
    .prepare("SELECT * FROM customers WHERE lower(email) = lower(?) LIMIT 1")
    .bind(email)
    .first<CustomerRow>();
  return row ? mapCustomer(row) : null;
}

export async function createCustomer(
  env: Env,
  input: CustomerCreate,
  defaultAssignedTo: string,
): Promise<Customer> {
  const now = isoNow();
  const id = newId("cus");
  await env.DB
    .prepare(
      `INSERT INTO customers (id, name, email, phone, company_id, assigned_to, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.name,
      input.email,
      input.phone ?? null,
      input.companyId ?? null,
      input.assignedTo ?? defaultAssignedTo,
      input.status ?? "prospect",
      now,
      now,
    )
    .run();
  const created = await getCustomer(env, id);
  if (!created) throw new Error(`createCustomer: insert for ${id} did not round-trip`);
  await publishCustomerEvent(env, id, {
    type: "customer.updated",
    customerId: id,
    payload: created,
  });
  return created;
}

export async function patchCustomer(
  env: Env,
  id: string,
  patch: CustomerPatch,
): Promise<Customer | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.name !== undefined) { sets.push("name = ?"); args.push(patch.name); }
  if (patch.email !== undefined) { sets.push("email = ?"); args.push(patch.email); }
  if (patch.phone !== undefined) { sets.push("phone = ?"); args.push(patch.phone ?? null); }
  if (patch.companyId !== undefined) { sets.push("company_id = ?"); args.push(patch.companyId ?? null); }
  if (patch.assignedTo !== undefined) { sets.push("assigned_to = ?"); args.push(patch.assignedTo); }
  if (patch.status !== undefined) { sets.push("status = ?"); args.push(patch.status); }
  sets.push("updated_at = ?");
  args.push(isoNow());
  args.push(id);
  const result = await env.DB
    .prepare(`UPDATE customers SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...args)
    .run();
  if ((result.meta?.changes ?? 0) === 0) return null;
  const updated = await getCustomer(env, id);
  if (updated) {
    await publishCustomerEvent(env, id, {
      type: "customer.updated",
      customerId: id,
      payload: updated,
    });
  }
  return updated;
}

export async function deleteCustomer(env: Env, id: string): Promise<boolean> {
  const result = await env.DB
    .prepare("DELETE FROM customers WHERE id = ?")
    .bind(id)
    .run();
  const ok = (result.meta?.changes ?? 0) > 0;
  if (ok) {
    await publishCustomerEvent(env, id, {
      type: "customer.deleted",
      customerId: id,
      payload: { id },
    });
  }
  return ok;
}

// ─── Activities ─────────────────────────────────────────────────────────────

export async function listTimeline(
  env: Env,
  customerId: string,
  opts: { cursor?: string; limit?: number },
): Promise<{ items: Activity[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const offset = decodeCursor(opts.cursor);
  const res = await env.DB
    .prepare(
      `SELECT * FROM activities WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .bind(customerId, limit + 1, offset)
    .all<ActivityRow>();
  const rows = res.results ?? [];
  const items = rows.slice(0, limit).map(mapActivity);
  const next = rows.length > limit ? encodeCursor(String(offset + limit)) : null;
  return { items, next_cursor: next };
}

export async function appendActivity(
  env: Env,
  input: {
    customerId: string;
    type: ActivityType;
    body: string;
    source: ActivitySource;
    actorId: string;
  },
): Promise<Activity> {
  const id = newId("act");
  const createdAt = isoNow();
  await env.DB
    .prepare(
      `INSERT INTO activities (id, customer_id, type, body, source, actor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, input.customerId, input.type, input.body, input.source, input.actorId, createdAt)
    .run();
  const activity = Activity.parse({
    id,
    customerId: input.customerId,
    type: input.type,
    body: input.body,
    source: input.source,
    actorId: input.actorId,
    createdAt,
  });
  await publishCustomerEvent(env, input.customerId, {
    type: "activity.created",
    customerId: input.customerId,
    activityId: id,
    payload: activity,
  });
  return activity;
}

// ─── Leads ──────────────────────────────────────────────────────────────────

export async function listLeads(
  env: Env,
  opts: { stage?: LeadStage; cursor?: string; limit?: number },
): Promise<{ items: Lead[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const offset = decodeCursor(opts.cursor);
  const where = opts.stage ? "WHERE stage = ?" : "";
  const args: unknown[] = opts.stage ? [opts.stage] : [];
  const res = await env.DB
    .prepare(`SELECT * FROM leads ${where} ORDER BY id LIMIT ? OFFSET ?`)
    .bind(...args, limit + 1, offset)
    .all<LeadRow>();
  const rows = res.results ?? [];
  const items = rows.slice(0, limit).map(mapLead);
  const next = rows.length > limit ? encodeCursor(String(offset + limit)) : null;
  return { items, next_cursor: next };
}

export async function getLead(env: Env, id: string): Promise<Lead | null> {
  const row = await env.DB
    .prepare("SELECT * FROM leads WHERE id = ?")
    .bind(id)
    .first<LeadRow>();
  return row ? mapLead(row) : null;
}

export async function patchLead(env: Env, id: string, patch: LeadPatch): Promise<Lead | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.stage !== undefined) { sets.push("stage = ?"); args.push(patch.stage); }
  if (patch.ltvEstimate !== undefined) { sets.push("ltv_estimate = ?"); args.push(patch.ltvEstimate); }
  if (patch.ownerId !== undefined) { sets.push("owner_id = ?"); args.push(patch.ownerId); }
  if (sets.length === 0) return getLead(env, id);
  args.push(id);
  const result = await env.DB
    .prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...args)
    .run();
  if ((result.meta?.changes ?? 0) === 0) return null;
  const updated = await getLead(env, id);
  if (updated) {
    await publishCustomerEvent(env, updated.customerId, {
      type: "lead.updated",
      customerId: updated.customerId,
      payload: updated,
    });
  }
  return updated;
}

// ─── Tickets ────────────────────────────────────────────────────────────────

export async function listTickets(
  env: Env,
  opts: { status?: TicketStatus; cursor?: string; limit?: number },
): Promise<{ items: Ticket[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const offset = decodeCursor(opts.cursor);
  const where = opts.status ? "WHERE status = ?" : "";
  const args: unknown[] = opts.status ? [opts.status] : [];
  const res = await env.DB
    .prepare(`SELECT * FROM tickets ${where} ORDER BY id LIMIT ? OFFSET ?`)
    .bind(...args, limit + 1, offset)
    .all<TicketRow>();
  const rows = res.results ?? [];
  const items = rows.slice(0, limit).map(mapTicket);
  const next = rows.length > limit ? encodeCursor(String(offset + limit)) : null;
  return { items, next_cursor: next };
}

export async function getTicket(env: Env, id: string): Promise<Ticket | null> {
  const row = await env.DB
    .prepare("SELECT * FROM tickets WHERE id = ?")
    .bind(id)
    .first<TicketRow>();
  return row ? mapTicket(row) : null;
}

export async function patchTicket(env: Env, id: string, patch: TicketPatch): Promise<Ticket | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.status !== undefined) { sets.push("status = ?"); args.push(patch.status); }
  if (patch.priority !== undefined) { sets.push("priority = ?"); args.push(patch.priority); }
  if (patch.slaBreached !== undefined) { sets.push("sla_breached = ?"); args.push(boolToInt(patch.slaBreached)); }
  if (patch.summary !== undefined) { sets.push("summary = ?"); args.push(patch.summary); }
  if (patch.closedAt !== undefined) { sets.push("closed_at = ?"); args.push(patch.closedAt ?? null); }
  if (sets.length === 0) return getTicket(env, id);
  args.push(id);
  const result = await env.DB
    .prepare(`UPDATE tickets SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...args)
    .run();
  if ((result.meta?.changes ?? 0) === 0) return null;
  const updated = await getTicket(env, id);
  if (updated) {
    await publishCustomerEvent(env, updated.customerId, {
      type: "ticket.updated",
      customerId: updated.customerId,
      payload: updated,
    });
  }
  return updated;
}

// ─── Prioritized actions (port of seed.ts ranking math to SQL) ──────────────

export async function prioritizedActions(env: Env, repId: string): Promise<PrioritizedAction[]> {
  // Pull every relevant row in three queries (small data; this is a single rep's
  // entire pipeline). The math lives in JS — porting the (score, customerId, kind)
  // tie-break to SQL is brittler than worth.
  const [customersRes, leadsRes, ticketsRes, lastActRes] = await Promise.all([
    env.DB.prepare("SELECT * FROM customers WHERE assigned_to = ?").bind(repId).all<CustomerRow>(),
    env.DB.prepare(
      "SELECT * FROM leads WHERE owner_id = ? AND stage NOT IN ('won','lost')",
    ).bind(repId).all<LeadRow>(),
    env.DB.prepare(
      "SELECT * FROM tickets WHERE status = 'open' AND customer_id IN (SELECT id FROM customers WHERE assigned_to = ?)",
    ).bind(repId).all<TicketRow>(),
    env.DB.prepare(
      `SELECT customer_id, MAX(created_at) AS last_at FROM activities
       WHERE customer_id IN (SELECT id FROM customers WHERE assigned_to = ?)
       GROUP BY customer_id`,
    ).bind(repId).all<{ customer_id: string; last_at: string }>(),
  ]);

  const ownCustomers = customersRes.results ?? [];
  if (ownCustomers.length === 0) return [];

  const openTicketCount = new Map<string, number>();
  for (const t of ticketsRes.results ?? []) {
    openTicketCount.set(t.customer_id, (openTicketCount.get(t.customer_id) ?? 0) + 1);
  }
  const lastActivityByCustomer = new Map<string, string>();
  for (const row of lastActRes.results ?? []) {
    lastActivityByCustomer.set(row.customer_id, row.last_at);
  }

  const daysSinceContact = (customerId: string): number => {
    const last = lastActivityByCustomer.get(customerId);
    if (!last) return 999;
    return Math.floor((Date.parse(NOW) - Date.parse(last)) / DAY_MS);
  };

  const scoreFor = (customerId: string, leadScore: number): number =>
    (openTicketCount.get(customerId) ?? 0) * 3 + leadScore + daysSinceContact(customerId);

  const actions: PrioritizedAction[] = [];

  for (const lead of leadsRes.results ?? []) {
    actions.push({
      kind: "lead",
      customerId: lead.customer_id,
      score: scoreFor(lead.customer_id, Math.round(lead.ltv_estimate / 1000)),
      reason: `Lead in ${lead.stage} stage — $${Number(lead.ltv_estimate).toLocaleString("en-US")} est. LTV`,
      dueAt: null,
    });
  }
  for (const t of ticketsRes.results ?? []) {
    actions.push({
      kind: "ticket",
      customerId: t.customer_id,
      score: scoreFor(t.customer_id, 0) + (intToBool(t.sla_breached) ? 10 : 0),
      reason: intToBool(t.sla_breached)
        ? `SLA breached — ${t.priority} priority: ${t.summary}`
        : `${t.priority} priority ticket: ${t.summary}`,
      dueAt: null,
    });
  }
  for (const c of ownCustomers) {
    const dsc = daysSinceContact(c.id);
    if (dsc > 7) {
      actions.push({
        kind: "check_in",
        customerId: c.id,
        score: dsc,
        reason: `No contact in ${dsc} days`,
        dueAt: null,
      });
    }
  }

  actions.sort(
    (a, b) =>
      b.score - a.score ||
      a.customerId.localeCompare(b.customerId) ||
      a.kind.localeCompare(b.kind),
  );
  return actions;
}

// ─── Research jobs ──────────────────────────────────────────────────────────

type ResearchJobRow = {
  id: string; customer_id: string; rep_id: string; status: string;
  started_at: string; completed_at: string | null; hint: string | null;
  affinities_json: string | null; error: string | null; steps: number;
};

function mapResearchJob(row: ResearchJobRow): ResearchJob {
  let affinities: ProspectAffinities | null = null;
  if (row.affinities_json) {
    try {
      affinities = ProspectAffinities.parse(JSON.parse(row.affinities_json));
    } catch (err) {
      // A stored affinities blob that no longer parses (schema drift, truncated
      // write) is recoverable — surface the job as-is with affinities=null and
      // an error note. Better than 500-ing on a poll.
      console.log(
        `[db] research_job ${row.id} affinities_json failed to parse: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return {
    id: row.id,
    customerId: row.customer_id,
    repId: row.rep_id,
    status: row.status as ResearchJobStatus,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    hint: row.hint,
    affinities,
    error: row.error,
    steps: row.steps,
  };
}

export async function startResearchJob(
  env: Env,
  input: { customerId: string; repId: string; hint: string | null },
): Promise<ResearchJob> {
  const id = newId("rsh");
  const startedAt = isoNow();
  await env.DB
    .prepare(
      `INSERT INTO research_jobs (id, customer_id, rep_id, status, started_at, hint, steps)
       VALUES (?, ?, ?, 'pending', ?, ?, 0)`,
    )
    .bind(id, input.customerId, input.repId, startedAt, input.hint)
    .run();
  return {
    id,
    customerId: input.customerId,
    repId: input.repId,
    status: "pending",
    startedAt,
    completedAt: null,
    hint: input.hint,
    affinities: null,
    error: null,
    steps: 0,
  };
}

export async function getResearchJob(
  env: Env,
  customerId: string,
  jobId: string,
): Promise<ResearchJob | null> {
  const row = await env.DB
    .prepare("SELECT * FROM research_jobs WHERE id = ? AND customer_id = ?")
    .bind(jobId, customerId)
    .first<ResearchJobRow>();
  return row ? mapResearchJob(row) : null;
}

export async function listResearchJobs(
  env: Env,
  customerId: string,
  opts: { cursor?: string; limit?: number },
): Promise<{ items: ResearchJob[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const offset = decodeCursor(opts.cursor);
  const res = await env.DB
    .prepare(
      `SELECT * FROM research_jobs WHERE customer_id = ?
       ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .bind(customerId, limit + 1, offset)
    .all<ResearchJobRow>();
  const rows = res.results ?? [];
  const items = rows.slice(0, limit).map(mapResearchJob);
  const next = rows.length > limit ? encodeCursor(String(offset + limit)) : null;
  return { items, next_cursor: next };
}

export async function latestCompleteResearchJob(
  env: Env,
  customerId: string,
): Promise<ResearchJob | null> {
  const row = await env.DB
    .prepare(
      `SELECT * FROM research_jobs WHERE customer_id = ? AND status = 'complete'
       ORDER BY completed_at DESC LIMIT 1`,
    )
    .bind(customerId)
    .first<ResearchJobRow>();
  return row ? mapResearchJob(row) : null;
}

export async function completeResearchJob(
  env: Env,
  customerId: string,
  jobId: string,
  result: ResearchJobResult,
): Promise<ResearchJob | null> {
  const completedAt = isoNow();
  const affinitiesJson = result.status === "complete" && result.affinities
    ? JSON.stringify(result.affinities)
    : null;
  const errMsg = result.status === "failed" ? result.error ?? "(no detail)" : null;
  const update = await env.DB
    .prepare(
      `UPDATE research_jobs
         SET status = ?, completed_at = ?, affinities_json = ?, error = ?, steps = ?
       WHERE id = ? AND customer_id = ?`,
    )
    .bind(
      result.status,
      completedAt,
      affinitiesJson,
      errMsg,
      result.steps,
      jobId,
      customerId,
    )
    .run();
  if ((update.meta?.changes ?? 0) === 0) return null;
  return getResearchJob(env, customerId, jobId);
}

// ─── Gift drafts ────────────────────────────────────────────────────────────

type GiftDraftRow = {
  id: string; customer_id: string; rep_id: string; research_job_id: string | null;
  idea: string; rationale: string; price_band: string;
  suggested_vendor: string | null; draft_note: string;
  source_urls_json: string; created_at: string;
};

function mapGiftDraft(row: GiftDraftRow): GiftDraft {
  let sourceUrls: string[] = [];
  try {
    const parsed = JSON.parse(row.source_urls_json);
    if (Array.isArray(parsed)) {
      sourceUrls = parsed.filter((x): x is string => typeof x === "string");
    }
  } catch {
    // tolerate corruption — empty array is safer than throwing on the poll
  }
  return {
    id: row.id,
    customerId: row.customer_id,
    repId: row.rep_id,
    researchJobId: row.research_job_id,
    idea: row.idea,
    rationale: row.rationale,
    priceBand: row.price_band as GiftDraft["priceBand"],
    suggestedVendor: row.suggested_vendor,
    draftNote: row.draft_note,
    sourceUrls,
    createdAt: row.created_at,
  };
}

export async function insertGiftDraft(
  env: Env,
  input: {
    customerId: string;
    repId: string;
    researchJobId: string | null;
    idea: string;
    rationale: string;
    priceBand: "$" | "$$" | "$$$";
    suggestedVendor: string | null;
    draftNote: string;
    sourceUrls: string[];
  },
): Promise<GiftDraft> {
  const id = newId("gft");
  const createdAt = isoNow();
  await env.DB
    .prepare(
      `INSERT INTO gift_drafts (id, customer_id, rep_id, research_job_id, idea, rationale,
                                price_band, suggested_vendor, draft_note, source_urls_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.customerId,
      input.repId,
      input.researchJobId,
      input.idea,
      input.rationale,
      input.priceBand,
      input.suggestedVendor,
      input.draftNote,
      JSON.stringify(input.sourceUrls),
      createdAt,
    )
    .run();
  return {
    id,
    customerId: input.customerId,
    repId: input.repId,
    researchJobId: input.researchJobId,
    idea: input.idea,
    rationale: input.rationale,
    priceBand: input.priceBand,
    suggestedVendor: input.suggestedVendor,
    draftNote: input.draftNote,
    sourceUrls: input.sourceUrls,
    createdAt,
  };
}

export async function listGiftDrafts(
  env: Env,
  customerId: string,
  opts: { cursor?: string; limit?: number },
): Promise<{ items: GiftDraft[]; next_cursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const offset = decodeCursor(opts.cursor);
  const res = await env.DB
    .prepare(
      `SELECT * FROM gift_drafts WHERE customer_id = ?
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .bind(customerId, limit + 1, offset)
    .all<GiftDraftRow>();
  const rows = res.results ?? [];
  const items = rows.slice(0, limit).map(mapGiftDraft);
  const next = rows.length > limit ? encodeCursor(String(offset + limit)) : null;
  return { items, next_cursor: next };
}

// ─── Dashboard counters ─────────────────────────────────────────────────────

export async function dashboardCounters(
  env: Env,
  repId: string,
): Promise<{ openTickets: number; openLeads: number; customers: number }> {
  const [openTickets, openLeads, customers] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM tickets WHERE status = 'open' AND customer_id IN (SELECT id FROM customers WHERE assigned_to = ?)`,
    ).bind(repId).first<{ n: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM leads WHERE owner_id = ? AND stage NOT IN ('won','lost')`,
    ).bind(repId).first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM customers WHERE assigned_to = ?`)
      .bind(repId).first<{ n: number }>(),
  ]);
  return {
    openTickets: openTickets?.n ?? 0,
    openLeads: openLeads?.n ?? 0,
    customers: customers?.n ?? 0,
  };
}

// ─── Site adapters ──────────────────────────────────────────────────────────

type SiteAdapterRow = {
  site: string;
  adapter_json: string;
  updated_by: string | null;
  updated_at: string;
};

/**
 * Read a discovery-mode override for a site. Returns null when no override
 * exists or the stored JSON fails validation — a drifted row must not take
 * down browser control; the caller falls back to the git-versioned default.
 */
export async function getSiteAdapterOverride(
  env: Env,
  site: string,
): Promise<SiteAdapter | null> {
  const row = await env.DB
    .prepare("SELECT * FROM site_adapter_overrides WHERE site = ?")
    .bind(site)
    .first<SiteAdapterRow>();
  if (!row) return null;
  try {
    const parsed = SiteAdapterSchema.safeParse(JSON.parse(row.adapter_json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Upsert a discovery-mode override. `repId` is recorded for the audit trail. */
export async function upsertSiteAdapterOverride(
  env: Env,
  adapter: SiteAdapter,
  repId: string,
): Promise<void> {
  await env.DB
    .prepare(
      `INSERT INTO site_adapter_overrides (site, adapter_json, updated_by, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(site) DO UPDATE SET
         adapter_json = excluded.adapter_json,
         updated_by   = excluded.updated_by,
         updated_at   = excluded.updated_at`,
    )
    .bind(adapter.site, JSON.stringify(adapter), repId, isoNow())
    .run();
}
