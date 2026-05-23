// Per-org stage-probability primitives. Server-only.
import { getDB } from "@/db/env.server";
import { DEAL_STAGES, STAGE_PROBABILITY_DEFAULTS, type DealStage } from "./stages";

export interface StageProbabilityRow {
  stage: DealStage;
  probability: number;
}

export async function seedStageProbabilities(orgId: string): Promise<void> {
  const db = getDB();
  // Six rows per org; INSERT OR IGNORE keeps this safe to call on every org
  // creation and on idempotent backfills.
  for (const stage of DEAL_STAGES) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO organization_stage_probabilities (org_id, stage, probability)
         VALUES (?, ?, ?)`,
      )
      .bind(orgId, stage, STAGE_PROBABILITY_DEFAULTS[stage])
      .run();
  }
}

export async function listStageProbabilities(orgId: string): Promise<StageProbabilityRow[]> {
  const db = getDB();
  const result = await db
    .prepare(
      `SELECT stage, probability
       FROM organization_stage_probabilities
       WHERE org_id = ?`,
    )
    .bind(orgId)
    .all<StageProbabilityRow>();
  const rows = result.results ?? [];
  // Self-heal: if the org predates the migration, top up missing stages with
  // defaults rather than returning a sparse map.
  const byStage = new Map(rows.map((r) => [r.stage, r.probability]));
  return DEAL_STAGES.map((stage) => ({
    stage,
    probability: byStage.get(stage) ?? STAGE_PROBABILITY_DEFAULTS[stage],
  }));
}

export async function getStageProbability(
  orgId: string,
  stage: DealStage,
): Promise<number> {
  const db = getDB();
  const row = await db
    .prepare(
      `SELECT probability FROM organization_stage_probabilities
       WHERE org_id = ? AND stage = ?`,
    )
    .bind(orgId, stage)
    .first<{ probability: number }>();
  return row?.probability ?? STAGE_PROBABILITY_DEFAULTS[stage];
}

export async function setStageProbability(
  orgId: string,
  stage: DealStage,
  probability: number,
): Promise<StageProbabilityRow> {
  if (probability < 0 || probability > 100 || !Number.isFinite(probability)) {
    throw new Error("probability must be an integer between 0 and 100");
  }
  const clamped = Math.round(probability);
  const db = getDB();
  await db
    .prepare(
      `INSERT INTO organization_stage_probabilities (org_id, stage, probability, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT (org_id, stage) DO UPDATE
         SET probability = excluded.probability,
             updated_at  = excluded.updated_at`,
    )
    .bind(orgId, stage, clamped)
    .run();
  return { stage, probability: clamped };
}
