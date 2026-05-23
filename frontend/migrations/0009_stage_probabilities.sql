-- Per-org stage confidence percentages.
-- Powers the weighted-pipeline math (deals.value * probability / 100) and
-- gives admins a knob to retune what each pipeline stage signals about
-- close likelihood. Defaults match src/lib/stages.ts STAGE_PROBABILITY_DEFAULTS.

CREATE TABLE organization_stage_probabilities (
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stage TEXT NOT NULL
    CHECK (stage IN ('discovery', 'qualified', 'proposal', 'closing', 'won', 'lost')),
  probability INTEGER NOT NULL
    CHECK (probability >= 0 AND probability <= 100),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, stage)
);

-- Seed defaults for every existing org. Six explicit INSERT OR IGNORE
-- statements — D1's compound-SELECT term limit and named-column VALUES
-- syntax restrictions both make this the most portable shape. Idempotent
-- on re-application; new orgs get their rows from app code (orgs.server.ts
-- → seedStageProbabilities).
INSERT OR IGNORE INTO organization_stage_probabilities (org_id, stage, probability)
  SELECT id, 'discovery', 10 FROM organizations;
INSERT OR IGNORE INTO organization_stage_probabilities (org_id, stage, probability)
  SELECT id, 'qualified', 25 FROM organizations;
INSERT OR IGNORE INTO organization_stage_probabilities (org_id, stage, probability)
  SELECT id, 'proposal', 50 FROM organizations;
INSERT OR IGNORE INTO organization_stage_probabilities (org_id, stage, probability)
  SELECT id, 'closing', 80 FROM organizations;
INSERT OR IGNORE INTO organization_stage_probabilities (org_id, stage, probability)
  SELECT id, 'won', 100 FROM organizations;
INSERT OR IGNORE INTO organization_stage_probabilities (org_id, stage, probability)
  SELECT id, 'lost', 0 FROM organizations;
