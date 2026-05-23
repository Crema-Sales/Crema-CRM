// Per-rep quota primitives + attainment/pipeline math. Server-only.
//
// Quotas are versioned: a single "active" row per (org_id, user_id) is the
// one where date('now') falls in [effective_from, effective_to). Edits
// close the prior row and insert a new one — never UPDATE in place.
//
// Attainment = closed-won deals whose closed_at falls in the active period.
// Pipeline   = open deals (stage not in won/lost) weighted by their
//              probability, where expected_close falls in the active
//              period. Deals without expected_close are excluded — there's
//              no period to attribute them to.
//
// Period boundaries are calendar UTC. Quarterly = Jan-Mar / Apr-Jun /
// Jul-Sep / Oct-Dec. Fiscal-year offset is a future knob (see prior
// design doc); not implemented here.

import { getDB } from "@/db/env.server";

export type PeriodType = "monthly" | "quarterly";

export interface QuotaRow {
  id: string;
  org_id: string;
  user_id: string;
  amount: number;
  period_type: PeriodType;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

export interface PeriodWindow {
  start: string;        // ISO date (UTC midnight)
  end: string;          // ISO date (UTC midnight) - exclusive
  days_total: number;
  days_elapsed: number;
}

export interface QuotaSnapshot {
  quota: { amount: number; period_type: PeriodType } | null;
  period: PeriodWindow | null;
  attained: { amount: number; deal_count: number };
  pipeline: { amount: number; deal_count: number };
  forecast: { amount: number };
}

function uuid(): string {
  return crypto.randomUUID();
}

function utcDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Calendar UTC period boundaries. Inclusive start, exclusive end.
export function periodWindow(today: Date, type: PeriodType): PeriodWindow {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth(); // 0-11
  let start: Date, end: Date;
  if (type === "monthly") {
    start = new Date(Date.UTC(year, month, 1));
    end = new Date(Date.UTC(year, month + 1, 1));
  } else {
    const qStartMonth = Math.floor(month / 3) * 3;
    start = new Date(Date.UTC(year, qStartMonth, 1));
    end = new Date(Date.UTC(year, qStartMonth + 3, 1));
  }
  const dayMs = 86_400_000;
  const days_total = Math.round((end.getTime() - start.getTime()) / dayMs);
  const days_elapsed = Math.min(
    days_total,
    Math.max(
      0,
      Math.floor((today.getTime() - start.getTime()) / dayMs) + 1,
    ),
  );
  return {
    start: utcDateOnly(start),
    end: utcDateOnly(end),
    days_total,
    days_elapsed,
  };
}

export async function getActiveQuota(
  orgId: string,
  userId: string,
): Promise<QuotaRow | null> {
  const db = getDB();
  const row = await db
    .prepare(
      `SELECT id, org_id, user_id, amount, period_type, effective_from,
              effective_to, created_at
       FROM user_quotas
       WHERE org_id = ? AND user_id = ?
         AND effective_from <= date('now')
         AND (effective_to IS NULL OR effective_to > date('now'))
       ORDER BY effective_from DESC
       LIMIT 1`,
    )
    .bind(orgId, userId)
    .first<QuotaRow>();
  return row ?? null;
}

export async function setUserQuota(params: {
  orgId: string;
  userId: string;
  amount: number;
  periodType: PeriodType;
  createdBy: string;
}): Promise<QuotaRow> {
  if (!Number.isFinite(params.amount) || params.amount < 0) {
    throw new Error("quota amount must be a non-negative number");
  }
  const db = getDB();
  // Close any currently-active row.
  await db
    .prepare(
      `UPDATE user_quotas
         SET effective_to = date('now')
       WHERE org_id = ? AND user_id = ?
         AND effective_to IS NULL`,
    )
    .bind(params.orgId, params.userId)
    .run();
  const id = uuid();
  await db
    .prepare(
      `INSERT INTO user_quotas
         (id, org_id, user_id, amount, period_type, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      params.orgId,
      params.userId,
      params.amount,
      params.periodType,
      params.createdBy,
    )
    .run();
  const row = await db
    .prepare(
      `SELECT id, org_id, user_id, amount, period_type, effective_from,
              effective_to, created_at
       FROM user_quotas WHERE id = ?`,
    )
    .bind(id)
    .first<QuotaRow>();
  if (!row) throw new Error("Failed to read back created quota");
  return row;
}

export async function clearUserQuota(
  orgId: string,
  userId: string,
): Promise<void> {
  const db = getDB();
  await db
    .prepare(
      `UPDATE user_quotas
         SET effective_to = date('now')
       WHERE org_id = ? AND user_id = ?
         AND effective_to IS NULL`,
    )
    .bind(orgId, userId)
    .run();
}

export async function computeAttainment(
  orgId: string,
  userId: string,
  window: PeriodWindow,
): Promise<{ amount: number; deal_count: number }> {
  const db = getDB();
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(value), 0) AS amount, COUNT(*) AS deal_count
       FROM deals
       WHERE org_id = ? AND owner_id = ? AND stage = 'won'
         AND closed_at >= ? AND closed_at < ?`,
    )
    .bind(orgId, userId, window.start, window.end)
    .first<{ amount: number; deal_count: number }>();
  return { amount: row?.amount ?? 0, deal_count: row?.deal_count ?? 0 };
}

export async function computePipeline(
  orgId: string,
  userId: string,
  window: PeriodWindow,
): Promise<{ amount: number; deal_count: number }> {
  const db = getDB();
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(value * probability / 100.0), 0) AS amount,
              COUNT(*) AS deal_count
       FROM deals
       WHERE org_id = ? AND owner_id = ?
         AND stage NOT IN ('won', 'lost')
         AND expected_close IS NOT NULL
         AND expected_close >= ? AND expected_close < ?`,
    )
    .bind(orgId, userId, window.start, window.end)
    .first<{ amount: number; deal_count: number }>();
  return { amount: row?.amount ?? 0, deal_count: row?.deal_count ?? 0 };
}

export async function quotaSnapshot(
  orgId: string,
  userId: string,
  now: Date = new Date(),
): Promise<QuotaSnapshot> {
  const quota = await getActiveQuota(orgId, userId);
  if (!quota) {
    return {
      quota: null,
      period: null,
      attained: { amount: 0, deal_count: 0 },
      pipeline: { amount: 0, deal_count: 0 },
      forecast: { amount: 0 },
    };
  }
  const window = periodWindow(now, quota.period_type);
  const [attained, pipeline] = await Promise.all([
    computeAttainment(orgId, userId, window),
    computePipeline(orgId, userId, window),
  ]);
  return {
    quota: { amount: quota.amount, period_type: quota.period_type },
    period: window,
    attained,
    pipeline,
    forecast: { amount: attained.amount + pipeline.amount },
  };
}
