-- Phase 08: deterministic seed. Preserves exact ids so Phase 04 evals + smoke logs still resolve.
-- Frozen relative to NOW = 2026-05-19T12:00:00Z. Re-run is idempotent (INSERT OR REPLACE).
-- Regenerate with: node backend/migrations/_generate-seed.mjs

INSERT OR REPLACE INTO sales_reps (id, email, name, active) VALUES
  ('rep_demo','demo@cremasales.example','Demo Rep',1),
  ('rep_other','other@cremasales.example','Other Rep',1);

INSERT OR REPLACE INTO customers (id, name, email, phone, company_id, assigned_to, status, created_at, updated_at) VALUES
  ('cus_001','Caffeine Co.','alice@cremasales.example','+1-555-0101','co_001','rep_demo','active','2026-01-19T12:00:00.000Z','2026-05-17T12:00:00.000Z'),
  ('cus_002','Roast & Co.','bob@cremasales.example','+1-555-0102','co_002','rep_demo','churn_risk','2026-02-13T12:00:00.000Z','2026-05-07T12:00:00.000Z'),
  ('cus_003','Espresso Bar Holdings','carla@cremasales.example','+1-555-0103','co_003','rep_demo','prospect','2026-03-20T12:00:00.000Z','2026-04-19T12:00:00.000Z'),
  ('cus_004','La Crema Holdings','dave@cremasales.example','+1-555-0104','co_004','rep_demo','active','2025-10-31T12:00:00.000Z','2026-05-18T12:00:00.000Z'),
  ('cus_005','Pour Over Partners','eve@cremasales.example','+1-555-0105','co_005','rep_other','dormant','2025-07-23T12:00:00.000Z','2026-04-09T12:00:00.000Z');

INSERT OR REPLACE INTO leads (id, customer_id, stage, ltv_estimate, owner_id, created_at) VALUES
  ('lead_001','cus_001','new',5000,'rep_demo','2026-05-05T12:00:00.000Z'),
  ('lead_002','cus_001','contacted',8000,'rep_demo','2026-05-09T12:00:00.000Z'),
  ('lead_003','cus_002','qualified',12000,'rep_demo','2026-04-27T12:00:00.000Z'),
  ('lead_004','cus_002','proposal',25000,'rep_demo','2026-05-01T12:00:00.000Z'),
  ('lead_005','cus_003','won',30000,'rep_demo','2026-03-30T12:00:00.000Z'),
  ('lead_006','cus_004','lost',4000,'rep_demo','2026-03-05T12:00:00.000Z'),
  ('lead_007','cus_004','new',7500,'rep_demo','2026-05-16T12:00:00.000Z'),
  ('lead_008','cus_005','contacted',6000,'rep_other','2026-04-09T12:00:00.000Z');

INSERT OR REPLACE INTO tickets (id, customer_id, status, priority, sla_breached, summary, opened_at, closed_at) VALUES
  ('tkt_001','cus_001','open','high',1,'Grinder calibration drifting between batches','2026-05-13T12:00:00.000Z',NULL),
  ('tkt_002','cus_002','open','urgent',1,'Espresso machine offline at flagship store','2026-05-15T12:00:00.000Z',NULL),
  ('tkt_003','cus_003','closed','normal',0,'Question about subscription pause','2026-04-21T12:00:00.000Z','2026-04-24T12:00:00.000Z'),
  ('tkt_004','cus_004','pending','low',0,'Requesting bulk-order discount tier','2026-05-10T12:00:00.000Z',NULL);

INSERT OR REPLACE INTO activities (id, customer_id, type, body, source, actor_id, created_at) VALUES
  ('act_001','cus_001','note','Initial outreach scheduled for Q2 expansion','ui','rep_demo','2026-05-04T12:00:00.000Z'),
  ('act_002','cus_001','email','Sent intro deck and pricing one-pager','ui','rep_demo','2026-05-09T12:00:00.000Z'),
  ('act_003','cus_001','call','Discovery call — interested in the subscription tier','ui','rep_demo','2026-05-17T12:00:00.000Z'),
  ('act_004','cus_002','page_view','Visited /pricing three times in one session','ingest','ingest_web','2026-04-29T12:00:00.000Z'),
  ('act_005','cus_002','agent_action','Copilot drafted churn-risk follow-up email','agent','agent_rep_demo','2026-05-07T12:00:00.000Z'),
  ('act_006','cus_003','ingest','Identified from marketing form submission','ingest','ingest_form','2026-04-14T12:00:00.000Z'),
  ('act_007','cus_003','note','Pre-call research: 3 locations, decision maker is owner','ui','rep_demo','2026-04-19T12:00:00.000Z'),
  ('act_008','cus_004','email','Renewal reminder — contract ends next quarter','ui','rep_demo','2026-05-11T12:00:00.000Z'),
  ('act_009','cus_004','call','Renewal call — signed multi-year extension','ui','rep_demo','2026-05-14T12:00:00.000Z'),
  ('act_010','cus_004','note','Customer requested help wiring up POS integration','ui','rep_demo','2026-05-18T12:00:00.000Z'),
  ('act_011','cus_005','page_view','Read blog post on espresso roast profiles','ingest','ingest_web','2026-04-04T12:00:00.000Z'),
  ('act_012','cus_005','note','Account dormant — schedule check-in next sprint','ui','rep_other','2026-04-09T12:00:00.000Z');
