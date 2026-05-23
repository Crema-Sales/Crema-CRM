// Entity generators. Pure functions over an Rng + word banks. They return
// plain rows ready to be turned into SQL by the writer; nothing here touches
// the network or the filesystem.

import { COMPANY_NAMES } from "../data/companies.js";
import { FIRST_NAMES, LAST_NAMES } from "../data/names.js";
import { DOMAIN_STEMS, TLDS } from "../data/domains.js";
import { INDUSTRIES } from "../data/industries.js";
import { TITLES } from "../data/titles.js";
import { LEAD_SOURCES } from "../data/sources.js";
import { ADJECTIVES, NOUNS, NOTE_FRAGMENTS, COMPANY_SUFFIXES } from "../data/words.js";
import { chance, intBetween, pick, type Rng } from "./rng.js";

// ---- IDs ----------------------------------------------------------------

// crypto.randomUUID exists in Bun and Node 19+. Wrap it for testability /
// to make the dependency obvious in one place.
export function uuid(): string {
  return crypto.randomUUID();
}

// ---- Orgs ---------------------------------------------------------------

export type GenOrg = {
  id: string;
  name: string;
  tracking_guid: string;
};

export function genOrg(rng: Rng, overrides: Partial<GenOrg> = {}): GenOrg {
  const name = overrides.name ?? `${pick(rng, ADJECTIVES)} ${pick(rng, NOUNS)}`;
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return {
    id: overrides.id ?? `org_${stem}_${intBetween(rng, 1000, 9999)}`,
    name,
    tracking_guid: overrides.tracking_guid ?? `${stem}-${intBetween(rng, 1000, 9999)}`,
  };
}

// ---- Companies ----------------------------------------------------------

export type GenCompany = {
  id: string;
  name: string;
  domain: string;
  industry: string;
  employee_count: number;
  notes: string | null;
  org_id: string;
};

export function genCompany(rng: Rng, orgId: string, overrides: Partial<GenCompany> = {}): GenCompany {
  // Either pick a hand-crafted name or combine adjective+noun for variety.
  const rawName = overrides.name
    ?? (chance(rng, 0.6)
      ? pick(rng, COMPANY_NAMES)
      : `${pick(rng, ADJECTIVES)} ${pick(rng, NOUNS)}`);
  const suffix = pick(rng, COMPANY_SUFFIXES);
  const name = suffix ? `${rawName} ${suffix}` : rawName;
  const stem = overrides.domain
    ? overrides.domain.split(".")[0]
    : (chance(rng, 0.5)
      ? pick(rng, DOMAIN_STEMS)
      : rawName.toLowerCase().replace(/[^a-z0-9]+/g, ""));
  const domain = overrides.domain ?? `${stem}${pick(rng, TLDS)}`;
  return {
    id: overrides.id ?? uuid(),
    name,
    domain,
    industry: overrides.industry ?? pick(rng, INDUSTRIES),
    employee_count: overrides.employee_count ?? intBetween(rng, 5, 5000),
    notes: overrides.notes !== undefined ? overrides.notes : (chance(rng, 0.4) ? pick(rng, NOTE_FRAGMENTS) : null),
    org_id: orgId,
  };
}

// ---- Contacts ----------------------------------------------------------

const STAGES = ["lead", "contact", "deal", "customer"] as const;
export type RelStage = typeof STAGES[number];

export type GenContact = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  title: string;
  company_id: string | null;
  owner_id: string | null;
  is_ideal_customer: number;
  notes: string | null;
  relationship_stage: RelStage;
  org_id: string;
};

export function genContact(
  rng: Rng,
  orgId: string,
  companyDomain: string | null,
  companyId: string | null,
  ownerId: string | null,
  overrides: Partial<GenContact> = {},
): GenContact {
  const first = overrides.full_name?.split(" ")[0] ?? pick(rng, FIRST_NAMES);
  const last  = overrides.full_name?.split(" ").slice(1).join(" ") || pick(rng, LAST_NAMES);
  const full  = overrides.full_name ?? `${first} ${last}`;
  const handle = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
  const domain = companyDomain ?? `${pick(rng, DOMAIN_STEMS)}${pick(rng, TLDS)}`;
  const email  = overrides.email ?? `${handle}@${domain}`;
  // North American–style phone. Good enough for demo.
  const phone = overrides.phone
    ?? `+1-${intBetween(rng, 200, 999)}-${intBetween(rng, 200, 999)}-${intBetween(rng, 1000, 9999)}`;
  return {
    id: overrides.id ?? uuid(),
    full_name: full,
    email,
    phone,
    title: overrides.title ?? pick(rng, TITLES),
    company_id: overrides.company_id ?? companyId,
    owner_id: overrides.owner_id ?? ownerId,
    is_ideal_customer: overrides.is_ideal_customer ?? (chance(rng, 0.25) ? 1 : 0),
    notes: overrides.notes !== undefined ? overrides.notes : (chance(rng, 0.4) ? pick(rng, NOTE_FRAGMENTS) : null),
    relationship_stage: overrides.relationship_stage ?? pick(rng, STAGES),
    org_id: orgId,
  };
}

// ---- Stage tasks --------------------------------------------------------

// Required per-stage checklist items. Mirrors STAGE_REQUIREMENTS in
// frontend/src/lib/crm.functions.ts — the funnel renders a
// checkbox per row and only makes it clickable when a backing `tasks` row
// with the matching stage_key exists. Keep these two lists in sync.
const STAGE_REQUIREMENTS: Record<Exclude<RelStage, "customer">, { key: string; title: string }[]> = {
  lead:    [{ key: "lead:drip",         title: "Assign drip campaign" },
            { key: "lead:calendly",     title: "Send Calendly invite" }],
  contact: [{ key: "contact:discovery", title: "Have discovery meeting" },
            { key: "contact:deal",      title: "Create deal with budget" }],
  deal:    [{ key: "deal:proposal",     title: "Send proposal" },
            { key: "deal:sign",         title: "Sign deal" }],
};

export type GenTask = {
  id: string;
  title: string;
  description: string;
  owner_id: string;
  related_contact_id: string;
  stage_key: string;
};

// Stage-checklist task rows for a contact, matching what seedStageTasks does
// app-side. Returns [] for customers (no required tasks) or owner-less
// contacts (tasks.owner_id is NOT NULL, so we can't seed them).
export function genStageTasks(contact: GenContact): GenTask[] {
  if (contact.relationship_stage === "customer" || !contact.owner_id) return [];
  return STAGE_REQUIREMENTS[contact.relationship_stage].map((r) => ({
    id: uuid(),
    title: r.title,
    description: `Auto-seeded for ${contact.full_name}`,
    owner_id: contact.owner_id as string,
    related_contact_id: contact.id,
    stage_key: r.key,
  }));
}

// ---- Leads --------------------------------------------------------------

const LEAD_STATUSES = ["new", "contacted", "qualified", "disqualified", "converted"] as const;
export type LeadStatus = typeof LEAD_STATUSES[number];

export type GenLead = {
  id: string;
  contact_id: string;
  source: string;
  status: LeadStatus;
  score: number;
  estimated_ltv: number;
  owner_id: string | null;
  ai_reasoning: string | null;
  org_id: string;
};

export function genLead(
  rng: Rng,
  orgId: string,
  contactId: string,
  ownerId: string | null,
  overrides: Partial<GenLead> = {},
): GenLead {
  return {
    id: overrides.id ?? uuid(),
    contact_id: contactId,
    source: overrides.source ?? pick(rng, LEAD_SOURCES),
    status: overrides.status ?? pick(rng, LEAD_STATUSES),
    score: overrides.score ?? intBetween(rng, 0, 100),
    estimated_ltv: overrides.estimated_ltv ?? intBetween(rng, 500, 250_000),
    owner_id: overrides.owner_id ?? ownerId,
    ai_reasoning: overrides.ai_reasoning ?? (chance(rng, 0.5) ? pick(rng, NOTE_FRAGMENTS) : null),
    org_id: orgId,
  };
}
