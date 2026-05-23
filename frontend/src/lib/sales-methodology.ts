// Sales methodology registry — single source of truth for BANT, MEDDIC,
// MEDDPICC, SPIN, and CHAMP. The settings page reads `METHODOLOGIES` to
// populate the dropdown; the per-deal report card reads `getMethodology()`
// to render the right checklist.

export type MethodologyKey =
  | "none"
  | "BANT"
  | "MEDDIC"
  | "MEDDPICC"
  | "SPIN"
  | "CHAMP";

export const METHODOLOGY_KEYS: MethodologyKey[] = [
  "none",
  "BANT",
  "MEDDIC",
  "MEDDPICC",
  "SPIN",
  "CHAMP",
];

export type CriterionStatus = "unknown" | "partial" | "confirmed";

export interface Criterion {
  key: string;
  label: string;
  description: string;
  examplePrompt: string;
}

export interface Methodology {
  key: MethodologyKey;
  name: string;
  tagline: string;
  criteria: Criterion[];
}

// Per-deal qualification state, stored as JSON on `deals.qualification_json`.
// Sparse: missing keys = "unknown". Bumping `updated_at` is the caller's job.
export interface CriterionState {
  status: CriterionStatus;
  notes?: string;
  updated_at?: string;
}
export type DealQualification = Record<string, CriterionState>;

const NONE: Methodology = {
  key: "none",
  name: "No methodology",
  tagline: "Free-form. No qualification checklist on deals.",
  criteria: [],
};

const BANT: Methodology = {
  key: "BANT",
  name: "BANT",
  tagline: "Budget · Authority · Need · Timeline",
  criteria: [
    {
      key: "budget",
      label: "Budget",
      description: "Prospect has identified or allocated funds for this purchase.",
      examplePrompt: "What budget range have you set aside for solving this?",
    },
    {
      key: "authority",
      label: "Authority",
      description: "We're talking to (or have a path to) the decision-maker.",
      examplePrompt: "Besides yourself, who else needs to sign off on this?",
    },
    {
      key: "need",
      label: "Need",
      description: "Pain or opportunity is real, named, and quantified.",
      examplePrompt: "What happens if you don't solve this in the next 90 days?",
    },
    {
      key: "timeline",
      label: "Timeline",
      description: "Prospect has a concrete decision and implementation window.",
      examplePrompt: "When do you need this live by, and what's driving that date?",
    },
  ],
};

const MEDDIC: Methodology = {
  key: "MEDDIC",
  name: "MEDDIC",
  tagline: "Metrics · Economic Buyer · Decision Criteria · Decision Process · Identify Pain · Champion",
  criteria: [
    {
      key: "metrics",
      label: "Metrics",
      description: "Quantified economic impact: $ saved, % lift, time recovered.",
      examplePrompt: "If this worked, what number on your dashboard moves and by how much?",
    },
    {
      key: "economic_buyer",
      label: "Economic Buyer",
      description: "The person who can release the budget — name, title, and we've met them.",
      examplePrompt: "Who controls the budget for this initiative?",
    },
    {
      key: "decision_criteria",
      label: "Decision Criteria",
      description: "Written list of how the buyer will compare options.",
      examplePrompt: "What criteria will you use to pick between vendors?",
    },
    {
      key: "decision_process",
      label: "Decision Process",
      description: "Step-by-step path to signature: who, when, in what order.",
      examplePrompt: "Walk me through how a purchase like this normally gets approved here.",
    },
    {
      key: "identify_pain",
      label: "Identify Pain",
      description: "Specific pain confirmed by the buyer in their words, with cost attached.",
      examplePrompt: "What's the cost of leaving this unfixed for another quarter?",
    },
    {
      key: "champion",
      label: "Champion",
      description: "Internal advocate who sells for us when we're not in the room.",
      examplePrompt: "Who internally is willing to push this forward on our behalf?",
    },
  ],
};

const MEDDPICC: Methodology = {
  key: "MEDDPICC",
  name: "MEDDPICC",
  tagline: "MEDDIC + Paper Process + Competition",
  criteria: [
    ...MEDDIC.criteria,
    {
      key: "paper_process",
      label: "Paper Process",
      description: "Procurement, legal, security review — the steps after verbal yes.",
      examplePrompt: "Once we agree on terms, what's the procurement path here?",
    },
    {
      key: "competition",
      label: "Competition",
      description: "Other vendors in the deal — including 'do nothing' and homegrown.",
      examplePrompt: "Who else are you evaluating, including building this yourselves?",
    },
  ],
};

const SPIN: Methodology = {
  key: "SPIN",
  name: "SPIN Selling",
  tagline: "Situation · Problem · Implication · Need-Payoff",
  criteria: [
    {
      key: "situation",
      label: "Situation",
      description: "Current state, tooling, team, and process fully mapped.",
      examplePrompt: "How are you handling this today, end to end?",
    },
    {
      key: "problem",
      label: "Problem",
      description: "Specific dissatisfactions or friction points named by the buyer.",
      examplePrompt: "Where does that process break down most often?",
    },
    {
      key: "implication",
      label: "Implication",
      description: "Downstream consequences of the problem — revenue, retention, time.",
      examplePrompt: "What does that breakage cost you in dollars or churn?",
    },
    {
      key: "need_payoff",
      label: "Need-Payoff",
      description: "Buyer articulates the value of solving it, unprompted.",
      examplePrompt: "If we removed that friction, what would it free your team up to do?",
    },
  ],
};

const CHAMP: Methodology = {
  key: "CHAMP",
  name: "CHAMP",
  tagline: "Challenges · Authority · Money · Prioritization",
  criteria: [
    {
      key: "challenges",
      label: "Challenges",
      description: "Pain comes first — what's broken that we can fix?",
      examplePrompt: "What's the single biggest challenge driving this conversation?",
    },
    {
      key: "authority",
      label: "Authority",
      description: "Who decides, who influences, who blocks.",
      examplePrompt: "Who else weighs in on a decision like this?",
    },
    {
      key: "money",
      label: "Money",
      description: "Budget shape — confirmed, in-flight, or needs business case.",
      examplePrompt: "Is there budget already, or are we building the case for it?",
    },
    {
      key: "prioritization",
      label: "Prioritization",
      description: "Where this sits against everything else competing for time.",
      examplePrompt: "Where does this rank against your other Q-priorities?",
    },
  ],
};

export const METHODOLOGIES: Record<MethodologyKey, Methodology> = {
  none: NONE,
  BANT,
  MEDDIC,
  MEDDPICC,
  SPIN,
  CHAMP,
};

export function getMethodology(key: MethodologyKey | string | null | undefined): Methodology {
  if (!key) return NONE;
  return METHODOLOGIES[key as MethodologyKey] ?? NONE;
}

// User override falls through to org default. A user value of "none" means
// "explicitly opt out", not "inherit" — that's the empty string / null.
export function resolveMethodology(
  userPref: MethodologyKey | string | null | undefined,
  orgPref: MethodologyKey | string | null | undefined,
): Methodology {
  if (userPref && userPref !== "") return getMethodology(userPref);
  return getMethodology(orgPref);
}

export function isMethodologyKey(value: unknown): value is MethodologyKey {
  return typeof value === "string" && (METHODOLOGY_KEYS as string[]).includes(value);
}

// % of criteria at confirmed status. "partial" counts half.
export function qualificationScore(
  methodology: Methodology,
  qualification: DealQualification | null | undefined,
): { done: number; total: number; pct: number } {
  const total = methodology.criteria.length;
  if (total === 0) return { done: 0, total: 0, pct: 0 };
  let weighted = 0;
  for (const c of methodology.criteria) {
    const s = qualification?.[c.key]?.status ?? "unknown";
    if (s === "confirmed") weighted += 1;
    else if (s === "partial") weighted += 0.5;
  }
  return { done: Math.round(weighted * 10) / 10, total, pct: weighted / total };
}
