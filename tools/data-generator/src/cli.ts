#!/usr/bin/env bun
// Entry point. Subcommand router for orgs / companies / contacts / leads / all.
// Run via `./data-generator/datagen <cmd> [opts]`.

import { parseArgs } from "node:util";
import { makeRng, pick, type Rng } from "./lib/rng.js";
import {
  genCompany,
  genContact,
  genLead,
  genOrg,
  genStageTasks,
  type GenCompany,
  type GenContact,
  type GenLead,
  type LeadStatus,
  type RelStage,
} from "./lib/gen.js";
import { asBatch, sqlCompany, sqlContact, sqlLead, sqlOrg, sqlTask } from "./lib/sql.js";
import { query, runSql, type Target } from "./lib/d1.js";

// One parseArgs covering every option any subcommand uses. Simpler than
// chained passes and avoids `strict: false` turning `--count 3` into a
// boolean flag plus a stray positional.
type Opts = {
  target: Target;
  seed: number;
  dryRun: boolean;
  count: number;
  org?: string;
  owner?: string;
  name?: string;
  email?: string;
  phone?: string;
  title?: string;
  domain?: string;
  industry?: string;
  employees?: number;
  companyId?: string;
  contactId?: string;
  stage?: RelStage;
  source?: string;
  status?: LeadStatus;
  score?: number;
  ltv?: number;
  guid?: string;
  notes?: string;
  id?: string;
};

const HELP = `data-generator — deterministic demo data for ctv_crm

Usage:
  datagen <command> [options]

Commands:
  orgs list                              List all organizations
  orgs create [--name N] [--guid G]      Create an organization
  companies --count N --org ORG_ID       Generate N companies in an org
  companies create --org ORG_ID --name N [--domain D] [--industry I]
                                         Create one company manually
  contacts --count N --org ORG_ID [--company-id ID]
                                         Generate N contacts (random or
                                         specified company)
  contacts create --org ORG_ID --name N --email E [--company-id ID] [--stage S]
                                         Create one contact manually
  leads --count N --org ORG_ID           Generate N leads (auto-creates
                                         backing contacts)
  leads create --org ORG_ID --contact-id ID [--source S] [--score N]
                                         Create one lead manually
  all --count N --org ORG_ID             Generate N of each, fully linked
  help                                   Print this message

Global options:
  --target local|remote   D1 target (default: local)
  --owner EMAIL_OR_ID     Assign new rows to this user (default: oldest
                          member of --org; pin this so demo data lands
                          on the rep you're logged in as)
  --seed N                Seed the RNG for reproducible runs
  --dry-run               Print SQL, don't execute
`;

function parseAllArgs(): { positionals: string[]; opts: Opts } {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      target: { type: "string", default: "local" },
      seed: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      count: { type: "string", short: "n" },
      org: { type: "string" },
      owner: { type: "string" },
      name: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      title: { type: "string" },
      domain: { type: "string" },
      industry: { type: "string" },
      employees: { type: "string" },
      "company-id": { type: "string" },
      "contact-id": { type: "string" },
      stage: { type: "string" },
      source: { type: "string" },
      status: { type: "string" },
      score: { type: "string" },
      ltv: { type: "string" },
      guid: { type: "string" },
      notes: { type: "string" },
      id: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  });
  const target: Target = values.target === "remote" ? "remote" : "local";
  const seed = values.seed ? Number(values.seed) : Math.floor(Math.random() * 0xffffffff);
  return {
    positionals,
    opts: {
      target,
      seed,
      dryRun: Boolean(values["dry-run"]),
      count: values.count ? Number(values.count) : 10,
      org: values.org as string | undefined,
      owner: values.owner as string | undefined,
      name: values.name as string | undefined,
      email: values.email as string | undefined,
      phone: values.phone as string | undefined,
      title: values.title as string | undefined,
      domain: values.domain as string | undefined,
      industry: values.industry as string | undefined,
      employees: values.employees ? Number(values.employees) : undefined,
      companyId: values["company-id"] as string | undefined,
      contactId: values["contact-id"] as string | undefined,
      stage: values.stage as RelStage | undefined,
      source: values.source as string | undefined,
      status: values.status as LeadStatus | undefined,
      score: values.score ? Number(values.score) : undefined,
      ltv: values.ltv ? Number(values.ltv) : undefined,
      guid: values.guid as string | undefined,
      notes: values.notes as string | undefined,
      id: values.id as string | undefined,
    },
  };
}

// ---- helpers -----------------------------------------------------------

function apply(opts: Opts, stmts: string[], label: string): void {
  if (stmts.length === 0) {
    console.log(`(${label}) nothing to do`);
    return;
  }
  const sql = asBatch(stmts);
  if (opts.dryRun) {
    console.log(`-- ${label}: ${stmts.length} statement(s) [DRY RUN]`);
    console.log(sql);
    return;
  }
  runSql(opts.target, sql);
  console.log(`(${label}) wrote ${stmts.length} rows to ${opts.target}`);
}

// Resolve `--owner <email-or-id>` to a user_id, or pick deterministically.
// Deterministic fallback: oldest member of the org by created_at. Avoids
// the random-pick footgun where the demo data lands on the wrong rep.
function pickOwner(target: Target, orgId: string, _rng: Rng, ownerHint?: string): string | null {
  if (ownerHint) {
    const q = ownerHint.replace(/'/g, "''");
    const row = query(
      target,
      `SELECT id FROM users WHERE id = '${q}' OR email = '${q}' LIMIT 1;`,
    )[0];
    if (row) return String(row.id);
    console.error(`error: --owner '${ownerHint}' did not match any user id or email`);
    process.exit(2);
  }
  const inOrg = query(
    target,
    `SELECT u.id FROM organization_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = '${orgId.replace(/'/g, "''")}' ORDER BY u.created_at LIMIT 1;`,
  );
  if (inOrg.length > 0) return String(inOrg[0].id);
  const anyUser = query(target, `SELECT id FROM users ORDER BY created_at LIMIT 1;`);
  if (anyUser.length > 0) return String(anyUser[0].id);
  return null;
}

function getCompaniesForOrg(target: Target, orgId: string): Array<{ id: string; domain: string | null }> {
  const rows = query(
    target,
    `SELECT id, domain FROM companies WHERE org_id = '${orgId.replace(/'/g, "''")}';`,
  );
  return rows.map((r) => ({ id: String(r.id), domain: r.domain ? String(r.domain) : null }));
}

function requireOrg(opts: Opts): string {
  if (!opts.org) {
    console.error("error: --org is required");
    process.exit(2);
  }
  return opts.org;
}

// ---- commands ----------------------------------------------------------

function cmdOrgsList(opts: Opts): void {
  const rows = query(opts.target, `SELECT id, name, tracking_guid, created_at FROM organizations ORDER BY created_at;`);
  if (rows.length === 0) {
    console.log("(no organizations)");
    return;
  }
  for (const r of rows) {
    console.log(`${r.id}\t${r.name}\t${r.tracking_guid}`);
  }
}

function cmdOrgsCreate(opts: Opts, rng: Rng): void {
  const org = genOrg(rng, { id: opts.id, name: opts.name, tracking_guid: opts.guid });
  apply(opts, [sqlOrg(org)], `orgs create ${org.id}`);
  console.log(`id=${org.id} name=${org.name} guid=${org.tracking_guid}`);
}

function cmdCompanies(opts: Opts, rng: Rng): void {
  const orgId = requireOrg(opts);
  const rows: GenCompany[] = [];
  for (let i = 0; i < opts.count; i++) rows.push(genCompany(rng, orgId));
  apply(opts, rows.map(sqlCompany), `companies x${opts.count}`);
}

function cmdCompaniesCreate(opts: Opts, rng: Rng): void {
  const orgId = requireOrg(opts);
  const co = genCompany(rng, orgId, {
    id: opts.id,
    name: opts.name,
    domain: opts.domain,
    industry: opts.industry,
    employee_count: opts.employees,
    notes: opts.notes,
  });
  apply(opts, [sqlCompany(co)], `companies create ${co.id}`);
  console.log(`id=${co.id} name=${co.name} domain=${co.domain}`);
}

function cmdContacts(opts: Opts, rng: Rng): void {
  const orgId = requireOrg(opts);
  const companies = getCompaniesForOrg(opts.target, orgId);
  if (companies.length === 0) {
    console.error(`error: org ${orgId} has no companies. Generate some first or pass --company-id with a known id.`);
    process.exit(2);
  }
  const owner = pickOwner(opts.target, orgId, rng, opts.owner);
  const fixed = opts.companyId;
  const rows: GenContact[] = [];
  for (let i = 0; i < opts.count; i++) {
    const co = fixed
      ? companies.find((c) => c.id === fixed) ?? companies[0]
      : pick(rng, companies);
    rows.push(genContact(rng, orgId, co.domain, co.id, owner));
  }
  apply(opts, [
    ...rows.map(sqlContact),
    ...rows.flatMap(genStageTasks).map(sqlTask),
  ], `contacts x${opts.count}`);
}

function cmdContactsCreate(opts: Opts, rng: Rng): void {
  const orgId = requireOrg(opts);
  const owner = pickOwner(opts.target, orgId, rng, opts.owner);
  const companyDomain = opts.companyId
    ? ((query(opts.target, `SELECT domain FROM companies WHERE id = '${opts.companyId.replace(/'/g, "''")}';`)[0]?.domain as string | undefined) ?? null)
    : null;
  const c = genContact(rng, orgId, companyDomain, opts.companyId ?? null, owner, {
    id: opts.id,
    full_name: opts.name,
    email: opts.email,
    phone: opts.phone,
    title: opts.title,
    relationship_stage: opts.stage,
    notes: opts.notes,
  });
  apply(opts, [sqlContact(c), ...genStageTasks(c).map(sqlTask)], `contacts create ${c.id}`);
  console.log(`id=${c.id} name=${c.full_name} email=${c.email}`);
}

function cmdLeads(opts: Opts, rng: Rng): void {
  const orgId = requireOrg(opts);
  const owner = pickOwner(opts.target, orgId, rng, opts.owner);
  const companies = getCompaniesForOrg(opts.target, orgId);
  if (companies.length === 0) {
    console.error(`error: org ${orgId} has no companies. Generate some first.`);
    process.exit(2);
  }
  const stmts: string[] = [];
  for (let i = 0; i < opts.count; i++) {
    const co = pick(rng, companies);
    const contact = genContact(rng, orgId, co.domain, co.id, owner);
    stmts.push(sqlContact(contact));
    for (const t of genStageTasks(contact)) stmts.push(sqlTask(t));
    stmts.push(sqlLead(genLead(rng, orgId, contact.id, owner)));
  }
  apply(opts, stmts, `leads x${opts.count} (+contacts)`);
}

function cmdLeadsCreate(opts: Opts, rng: Rng): void {
  const orgId = requireOrg(opts);
  if (!opts.contactId) {
    console.error("error: --contact-id is required");
    process.exit(2);
  }
  const owner = pickOwner(opts.target, orgId, rng, opts.owner);
  const l = genLead(rng, orgId, opts.contactId, owner, {
    id: opts.id,
    source: opts.source,
    status: opts.status,
    score: opts.score,
    estimated_ltv: opts.ltv,
  });
  apply(opts, [sqlLead(l)], `leads create ${l.id}`);
  console.log(`id=${l.id} contact=${l.contact_id} source=${l.source}`);
}

function cmdAll(opts: Opts, rng: Rng): void {
  const orgId = requireOrg(opts);
  const owner = pickOwner(opts.target, orgId, rng, opts.owner);

  const companies: GenCompany[] = [];
  for (let i = 0; i < opts.count; i++) companies.push(genCompany(rng, orgId));

  const contacts: GenContact[] = [];
  for (let i = 0; i < opts.count; i++) {
    const co = pick(rng, companies);
    contacts.push(genContact(rng, orgId, co.domain, co.id, owner));
  }

  const leads: GenLead[] = [];
  for (let i = 0; i < opts.count; i++) {
    const ct = pick(rng, contacts);
    leads.push(genLead(rng, orgId, ct.id, owner));
  }

  apply(opts, [
    ...companies.map(sqlCompany),
    ...contacts.map(sqlContact),
    ...contacts.flatMap(genStageTasks).map(sqlTask),
    ...leads.map(sqlLead),
  ], `all x${opts.count} (companies+contacts+leads)`);
}

// ---- main --------------------------------------------------------------

function main() {
  const raw = process.argv.slice(2);
  if (raw.length === 0 || raw[0] === "help" || raw[0] === "--help" || raw[0] === "-h") {
    console.log(HELP);
    return;
  }
  const { positionals, opts } = parseAllArgs();
  const cmd = positionals[0];
  const sub = positionals[1];

  console.log(`# seed=${opts.seed} target=${opts.target}${opts.dryRun ? " dry-run" : ""}`);
  const rng = makeRng(opts.seed);

  switch (cmd) {
    case "orgs":
      if (sub === "list") return cmdOrgsList(opts);
      if (sub === "create") return cmdOrgsCreate(opts, rng);
      console.error(`unknown orgs subcommand: ${sub ?? "(none)"}`); process.exit(2);
    case "companies":
      if (sub === "create") return cmdCompaniesCreate(opts, rng);
      return cmdCompanies(opts, rng);
    case "contacts":
      if (sub === "create") return cmdContactsCreate(opts, rng);
      return cmdContacts(opts, rng);
    case "leads":
      if (sub === "create") return cmdLeadsCreate(opts, rng);
      return cmdLeads(opts, rng);
    case "all":
      return cmdAll(opts, rng);
    default:
      console.error(`unknown command: ${cmd ?? "(none)"}`);
      console.error(HELP);
      process.exit(2);
  }
}

main();
