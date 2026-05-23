// Build idempotent-ish INSERT statements for the CRM tables. We escape
// strings ourselves (SQLite-style single-quote doubling) since wrangler's
// `--command` and `--file` modes accept raw SQL only.

import type { GenCompany, GenContact, GenLead, GenOrg, GenTask } from "./gen.js";

function q(v: string | null | number): string {
  if (v === null) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${v.replace(/'/g, "''")}'`;
}

export function sqlOrg(o: GenOrg): string {
  return `INSERT INTO organizations (id, name, tracking_guid) VALUES (${q(o.id)}, ${q(o.name)}, ${q(o.tracking_guid)});`;
}

export function sqlCompany(c: GenCompany): string {
  return `INSERT INTO companies (id, name, domain, industry, employee_count, notes, org_id) VALUES (${
    q(c.id)}, ${q(c.name)}, ${q(c.domain)}, ${q(c.industry)}, ${q(c.employee_count)}, ${q(c.notes)}, ${q(c.org_id)});`;
}

export function sqlContact(c: GenContact): string {
  return `INSERT INTO contacts (id, full_name, email, phone, title, company_id, owner_id, is_ideal_customer, notes, relationship_stage, org_id) VALUES (${
    q(c.id)}, ${q(c.full_name)}, ${q(c.email)}, ${q(c.phone)}, ${q(c.title)}, ${q(c.company_id)}, ${q(c.owner_id)}, ${q(c.is_ideal_customer)}, ${q(c.notes)}, ${q(c.relationship_stage)}, ${q(c.org_id)});`;
}

// Stage-checklist tasks. `priority` is hard-coded to the table default so the
// funnel checklist rows are clickable; completed defaults to 0 in the schema.
export function sqlTask(t: GenTask): string {
  return `INSERT INTO tasks (id, title, description, priority, owner_id, related_contact_id, stage_key) VALUES (${
    q(t.id)}, ${q(t.title)}, ${q(t.description)}, 'medium', ${q(t.owner_id)}, ${q(t.related_contact_id)}, ${q(t.stage_key)});`;
}

export function sqlLead(l: GenLead): string {
  return `INSERT INTO leads (id, contact_id, source, status, score, estimated_ltv, owner_id, ai_reasoning, org_id) VALUES (${
    q(l.id)}, ${q(l.contact_id)}, ${q(l.source)}, ${q(l.status)}, ${q(l.score)}, ${q(l.estimated_ltv)}, ${q(l.owner_id)}, ${q(l.ai_reasoning)}, ${q(l.org_id)});`;
}

// D1 rejects BEGIN/COMMIT — it uses Durable Object storage transactions
// under the hood. Statements run sequentially; a mid-batch failure leaves
// the prior rows committed. For demo seeding that's acceptable.
export function asBatch(stmts: string[]): string {
  return stmts.join("\n");
}
