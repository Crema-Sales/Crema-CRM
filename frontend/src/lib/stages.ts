// Deal pipeline stages and their default confidence percentages.
// Defaults are seeded into organization_stage_probabilities on org create;
// admins can override per-org from Settings (and eventually from the deal
// Kanban column header when that lands).

export const DEAL_STAGES = [
  "discovery",
  "qualified",
  "proposal",
  "closing",
  "won",
  "lost",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export const STAGE_PROBABILITY_DEFAULTS: Record<DealStage, number> = {
  discovery: 10,
  qualified: 25,
  proposal:  50,
  closing:   80,
  won:      100,
  lost:       0,
};

// Pretty labels for UI surfaces. Capitalized; identical to stage key otherwise.
export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  discovery: "Discovery",
  qualified: "Qualified",
  proposal:  "Proposal",
  closing:   "Closing",
  won:       "Won",
  lost:      "Lost",
};

export function isDealStage(s: string): s is DealStage {
  return (DEAL_STAGES as readonly string[]).includes(s);
}
