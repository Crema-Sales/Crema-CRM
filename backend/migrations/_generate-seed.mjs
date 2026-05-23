// One-off generator for 0002_seed.sql. Run with `node backend/migrations/_generate-seed.mjs`.
// Keep this file in-tree as the seed audit trail — the SQL file is authoritative.

import fs from "node:fs";

const NOW = Date.parse("2026-05-19T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const d = (n) => new Date(NOW - n * DAY).toISOString();
const q = (s) => (s === null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);

const customers = [
  ["cus_001", "Caffeine Co.", "alice@cremasales.example", "+1-555-0101", "co_001", "rep_demo", "active", 120, 2],
  ["cus_002", "Roast & Co.", "bob@cremasales.example", "+1-555-0102", "co_002", "rep_demo", "churn_risk", 95, 12],
  ["cus_003", "Espresso Bar Holdings", "carla@cremasales.example", "+1-555-0103", "co_003", "rep_demo", "prospect", 60, 30],
  ["cus_004", "La Crema Holdings", "dave@cremasales.example", "+1-555-0104", "co_004", "rep_demo", "active", 200, 1],
  ["cus_005", "Pour Over Partners", "eve@cremasales.example", "+1-555-0105", "co_005", "rep_other", "dormant", 300, 40],
];

const leads = [
  ["lead_001", "cus_001", "new", 5000, "rep_demo", 14],
  ["lead_002", "cus_001", "contacted", 8000, "rep_demo", 10],
  ["lead_003", "cus_002", "qualified", 12000, "rep_demo", 22],
  ["lead_004", "cus_002", "proposal", 25000, "rep_demo", 18],
  ["lead_005", "cus_003", "won", 30000, "rep_demo", 50],
  ["lead_006", "cus_004", "lost", 4000, "rep_demo", 75],
  ["lead_007", "cus_004", "new", 7500, "rep_demo", 3],
  ["lead_008", "cus_005", "contacted", 6000, "rep_other", 40],
];

const tickets = [
  ["tkt_001", "cus_001", "open", "high", 1, "Grinder calibration drifting between batches", 6, null],
  ["tkt_002", "cus_002", "open", "urgent", 1, "Espresso machine offline at flagship store", 4, null],
  ["tkt_003", "cus_003", "closed", "normal", 0, "Question about subscription pause", 28, 25],
  ["tkt_004", "cus_004", "pending", "low", 0, "Requesting bulk-order discount tier", 9, null],
];

const activities = [
  ["act_001", "cus_001", "note", "Initial outreach scheduled for Q2 expansion", "ui", "rep_demo", 15],
  ["act_002", "cus_001", "email", "Sent intro deck and pricing one-pager", "ui", "rep_demo", 10],
  ["act_003", "cus_001", "call", "Discovery call — interested in the subscription tier", "ui", "rep_demo", 2],
  ["act_004", "cus_002", "page_view", "Visited /pricing three times in one session", "ingest", "ingest_web", 20],
  ["act_005", "cus_002", "agent_action", "Copilot drafted churn-risk follow-up email", "agent", "agent_rep_demo", 12],
  ["act_006", "cus_003", "ingest", "Identified from marketing form submission", "ingest", "ingest_form", 35],
  ["act_007", "cus_003", "note", "Pre-call research: 3 locations, decision maker is owner", "ui", "rep_demo", 30],
  ["act_008", "cus_004", "email", "Renewal reminder — contract ends next quarter", "ui", "rep_demo", 8],
  ["act_009", "cus_004", "call", "Renewal call — signed multi-year extension", "ui", "rep_demo", 5],
  ["act_010", "cus_004", "note", "Customer requested help wiring up POS integration", "ui", "rep_demo", 1],
  ["act_011", "cus_005", "page_view", "Read blog post on espresso roast profiles", "ingest", "ingest_web", 45],
  ["act_012", "cus_005", "note", "Account dormant — schedule check-in next sprint", "ui", "rep_other", 40],
];

let sql = "-- Phase 08: deterministic seed. Preserves exact ids so Phase 04 evals + smoke logs still resolve.\n";
sql += "-- Frozen relative to NOW = 2026-05-19T12:00:00Z. Re-run is idempotent (INSERT OR REPLACE).\n";
sql += "-- Regenerate with: node backend/migrations/_generate-seed.mjs\n\n";

sql += "INSERT OR REPLACE INTO sales_reps (id, email, name, active) VALUES\n";
sql += "  ('rep_demo','demo@cremasales.example','Demo Rep',1),\n";
sql += "  ('rep_other','other@cremasales.example','Other Rep',1);\n\n";

sql += "INSERT OR REPLACE INTO customers (id, name, email, phone, company_id, assigned_to, status, created_at, updated_at) VALUES\n";
sql += customers
  .map(([id, name, email, phone, co, rep, status, cd, ud]) =>
    `  (${q(id)},${q(name)},${q(email)},${q(phone)},${q(co)},${q(rep)},${q(status)},${q(d(cd))},${q(d(ud))})`,
  )
  .join(",\n");
sql += ";\n\n";

sql += "INSERT OR REPLACE INTO leads (id, customer_id, stage, ltv_estimate, owner_id, created_at) VALUES\n";
sql += leads
  .map(([id, c, s, ltv, o, cd]) =>
    `  (${q(id)},${q(c)},${q(s)},${ltv},${q(o)},${q(d(cd))})`,
  )
  .join(",\n");
sql += ";\n\n";

sql += "INSERT OR REPLACE INTO tickets (id, customer_id, status, priority, sla_breached, summary, opened_at, closed_at) VALUES\n";
sql += tickets
  .map(([id, c, s, p, sla, sum, od, cd]) =>
    `  (${q(id)},${q(c)},${q(s)},${q(p)},${sla},${q(sum)},${q(d(od))},${cd === null ? "NULL" : q(d(cd))})`,
  )
  .join(",\n");
sql += ";\n\n";

sql += "INSERT OR REPLACE INTO activities (id, customer_id, type, body, source, actor_id, created_at) VALUES\n";
sql += activities
  .map(([id, c, t, b, s, a, cd]) =>
    `  (${q(id)},${q(c)},${q(t)},${q(b)},${q(s)},${q(a)},${q(d(cd))})`,
  )
  .join(",\n");
sql += ";\n";

const out = new URL("./0002_seed.sql", import.meta.url);
fs.writeFileSync(out, sql);
console.log(`wrote ${sql.length} bytes → ${out.pathname}`);
