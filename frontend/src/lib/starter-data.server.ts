// Plant a fresh, owner-scoped starter workspace for a brand-new user.
//
// New accounts join the shared CremaSales house org (see auth/server-fns.ts),
// but every CRM list query in crm.functions.ts is scoped to owner_id = the
// current user — getToday / getFunnel / getRelationships all filter to records
// the caller owns. So a newly registered rep, who owns nothing, lands on an
// empty Today / Funnel / Relationships despite the org being full of seeded
// data owned by other users. This seeds each newcomer their own small,
// self-contained book of business so the app is populated from first login.
//
// Called exactly once, at sign-up. Best-effort: the caller swallows failures
// so a seeding hiccup never blocks account creation.
import { getDB } from "@/db/env.server";

const uuid = () => crypto.randomUUID();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();

// Strip accents and non-letters so a name maps to a clean email local-part.
function emailLocalPart(fullName: string): string {
  return fullName.toLowerCase().normalize("NFD").replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
}

export async function seedStarterDataForUser(userId: string, orgId: string): Promise<void> {
  const db = getDB();

  // ── companies ──
  const companies = [
    { id: uuid(), name: "Roastery Republic", domain: "roasteryrepublic.com", industry: "Specialty Retail", location: "Portland, OR", employee_count: 120 },
    { id: uuid(), name: "Bluepeak Software", domain: "bluepeak.io",          industry: "SaaS",             location: "Denver, CO",   employee_count: 310 },
    { id: uuid(), name: "Harbor Logistics",  domain: "harborlogistics.com",  industry: "Logistics",        location: "Tacoma, WA",   employee_count: 540 },
    { id: uuid(), name: "Vantage Health",    domain: "vantagehealth.org",    industry: "Healthcare",       location: "Austin, TX",   employee_count: 95  },
  ];
  for (const c of companies) {
    await db.prepare(
      `INSERT INTO companies (id, name, domain, industry, location, employee_count, created_by, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(c.id, c.name, c.domain, c.industry, c.location, c.employee_count, userId, orgId).run();
  }

  // ── contacts ── (relationship_stage drives the Funnel columns)
  const contacts = [
    { id: uuid(), full_name: "Elena Brooks",  title: "VP Sales",         co: 0, stage: "deal",     ideal: 1, days: 6  },
    { id: uuid(), full_name: "Priya Nair",    title: "CTO",              co: 1, stage: "lead",     ideal: 1, days: 2  },
    { id: uuid(), full_name: "Marcus Webb",   title: "Head of Ops",      co: 2, stage: "contact",  ideal: 0, days: 4  },
    { id: uuid(), full_name: "Tomás Rivera",  title: "Procurement Lead", co: 3, stage: "contact",  ideal: 0, days: 9  },
    { id: uuid(), full_name: "Dana Klein",    title: "Founder",          co: 0, stage: "customer", ideal: 1, days: 24 },
    { id: uuid(), full_name: "Sam Whitfield", title: "IT Director",      co: 1, stage: "lead",     ideal: 0, days: 1  },
  ];
  for (const c of contacts) {
    const email = `${emailLocalPart(c.full_name)}@${companies[c.co].domain}`;
    await db.prepare(
      `INSERT INTO contacts (id, full_name, title, email, company_id, owner_id, org_id, is_ideal_customer, relationship_stage, stage_entered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(c.id, c.full_name, c.title, email, companies[c.co].id, userId, orgId, c.ideal, c.stage, daysAgo(c.days)).run();
  }

  // ── relationships + their primary contact / company links ──
  // status taxonomy: new | stale | lead | discovery | budget_confirmed | customer
  const rels = [
    { id: uuid(), name: "Roastery Republic — Wholesale program", status: "budget_confirmed", contact: 0, company: 0 },
    { id: uuid(), name: "Bluepeak Software — Platform pilot",     status: "discovery",        contact: 1, company: 1 },
    { id: uuid(), name: "Harbor Logistics — Fleet rollout",       status: "lead",             contact: 2, company: 2 },
  ];
  for (const r of rels) {
    await db.prepare(
      `INSERT INTO relationships (id, org_id, name, status, owner_id) VALUES (?, ?, ?, ?, ?)`,
    ).bind(r.id, orgId, r.name, r.status, userId).run();
    await db.prepare(
      `INSERT INTO relationship_contacts (id, relationship_id, contact_id, org_id, role, is_primary)
       VALUES (?, ?, ?, ?, 'primary', 1)`,
    ).bind(uuid(), r.id, contacts[r.contact].id, orgId).run();
    await db.prepare(
      `INSERT INTO relationship_companies (id, relationship_id, company_id, org_id, role, is_primary)
       VALUES (?, ?, ?, ?, 'primary', 1)`,
    ).bind(uuid(), r.id, companies[r.company].id, orgId).run();
  }

  // ── deals ── one per relationship; powers Today's pipeline-value ranking
  const deals = [
    { rel: 0, name: "Wholesale annual contract", stage: "closing",   value: 84000, probability: 80 },
    { rel: 1, name: "Platform pilot — 50 seats", stage: "proposal",  value: 38000, probability: 50 },
    { rel: 2, name: "Fleet rollout — Phase 1",   stage: "qualified", value: 52000, probability: 25 },
  ];
  for (let i = 0; i < deals.length; i++) {
    const d = deals[i];
    const r = rels[d.rel];
    const dealId = uuid();
    await db.prepare(
      `INSERT INTO deals (id, name, stage, value, probability, company_id, contact_id, owner_id, org_id, relationship_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(dealId, d.name, d.stage, d.value, d.probability, companies[r.company].id, contacts[r.contact].id, userId, orgId, r.id, i).run();
    await db.prepare(
      `INSERT INTO relationship_deals (id, relationship_id, deal_id, role) VALUES (?, ?, ?, 'primary')`,
    ).bind(uuid(), r.id, dealId).run();
  }

  // ── open tasks ── populate Today's action list (getToday: owner_id, completed = 0)
  const tasks = [
    { title: "Send wholesale pricing to Elena Brooks",        desc: "She asked for the annual tier breakdown after the tasting.", priority: "high",   due: 1, contact: 0 },
    { title: "Prep discovery deck for the Bluepeak pilot",    desc: "Tailor the 50-seat rollout slides for Priya's team.",        priority: "medium", due: 2, contact: 1 },
    { title: "Follow up with Harbor Logistics on fleet specs", desc: null,                                                        priority: "medium", due: 3, contact: 2 },
    { title: "Schedule a check-in with Dana Klein",           desc: "First quarter as a customer — make sure onboarding stuck.",  priority: "low",    due: 5, contact: 4 },
  ];
  for (const t of tasks) {
    await db.prepare(
      `INSERT INTO tasks (id, title, description, priority, due_at, owner_id, org_id, related_contact_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(uuid(), t.title, t.desc, t.priority, daysAhead(t.due), userId, orgId, contacts[t.contact].id).run();
  }

  // ── activities ── recent history on contact / relationship timelines
  const activities = [
    { type: "meeting", subject: "Tasting + wholesale walkthrough",           contact: 0, hours: 26 },
    { type: "call",    subject: "Intro call with Priya's platform team",     contact: 1, hours: 5  },
    { type: "note",    subject: "Harbor wants Phase 1 scoped to two depots", contact: 2, hours: 48 },
  ];
  for (const a of activities) {
    await db.prepare(
      `INSERT INTO activities (id, type, subject, contact_id, owner_id, org_id, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(uuid(), a.type, a.subject, contacts[a.contact].id, userId, orgId, hoursAgo(a.hours)).run();
  }
}
