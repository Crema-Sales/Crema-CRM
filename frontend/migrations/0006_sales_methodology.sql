-- Sales methodology preference + per-deal qualification snapshot.
--
-- Resolution rule (enforced in app code, see src/lib/sales-methodology.ts):
--   user.sales_methodology (non-null) overrides organizations.sales_methodology.
--   NULL on users means "inherit from org". 'none' is an explicit opt-out,
--   not inherit.
--
-- qualification_json is a sparse map: { criterion_key -> { status, notes,
-- updated_at } }. Missing keys default to "unknown". We store JSON rather
-- than normalizing because the criteria set differs per methodology and v1
-- has no need for per-criterion SQL aggregates.

ALTER TABLE organizations
  ADD COLUMN sales_methodology TEXT NOT NULL DEFAULT 'none'
  CHECK (sales_methodology IN ('none', 'BANT', 'MEDDIC', 'MEDDPICC', 'SPIN', 'CHAMP'));

ALTER TABLE users
  ADD COLUMN sales_methodology TEXT
  CHECK (sales_methodology IS NULL
         OR sales_methodology IN ('none', 'BANT', 'MEDDIC', 'MEDDPICC', 'SPIN', 'CHAMP'));

ALTER TABLE deals
  ADD COLUMN qualification_json TEXT;
