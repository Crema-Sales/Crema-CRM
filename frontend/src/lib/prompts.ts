/**
 * Catalog of prompts the app exposes for per-org editing in
 * /settings → Prompts. Keys, labels, and in-code defaults live here so
 * both client and server bundles can import them. Read/write helpers
 * (D1-touching) live alongside this file as `prompts.server.ts`.
 *
 * The base copilot SYSTEM_PROMPT (in the backend agent worker) is
 * deliberately NOT in this catalog — it encodes safety/scope rules. The
 * org overlay layered on top of it IS editable here, mirrored back to
 * organizations.system_prompt (the column the backend reads) so existing
 * agent flows keep working.
 */

export const PROMPT_KEYS = [
  "org_overlay",
  "enrichment_company",
  "enrichment_contact",
] as const;
export type PromptKey = (typeof PROMPT_KEYS)[number];

export const PROMPT_LABELS: Record<PromptKey, { title: string; help: string }> = {
  org_overlay: {
    title: "Org overlay (copilot house style)",
    help:
      "Layered on top of Crema's base copilot prompt for every rep in this org. " +
      "Use it for vertical, ICP, or non-negotiable selling rules. " +
      "Base scope and safety rules always win — this shapes how the agent speaks, not what it can do.",
  },
  enrichment_company: {
    title: "Company enrichment",
    help:
      "System prompt for the agent that fills in logo, description, ticker, " +
      "size estimate, and notes when a new company domain is added. " +
      "Output must match the JSON schema the agent is given.",
  },
  enrichment_contact: {
    title: "Contact enrichment",
    help:
      "System prompt for the agent that fills in LinkedIn URL and a short bio " +
      "when a new contact email is added. Output must match the JSON schema the agent is given.",
  },
};

export const DEFAULT_PROMPTS: Record<PromptKey, string> = {
  org_overlay: "",
  enrichment_company:
    "You are a CRM enrichment agent. Given a company name and domain, use the " +
    "web_search and fetch_url tools to gather a salesperson-useful profile: the " +
    "official website URL, a logo image URL (prefer the favicon or og:image from " +
    "the homepage — must be a direct image link), a 1–2 sentence description of " +
    "what the company does, 2–4 short bullet-style notes a salesperson would " +
    "want at a glance (recent funding, notable customers, vertical, headline " +
    "moves), the public stock ticker with exchange prefix if the company is " +
    "publicly traded (e.g. \"NASDAQ:NVDA\" — leave empty for private companies), " +
    "and a size estimate from this fixed set: \"1-10\", \"11-50\", \"51-200\", " +
    "\"201-500\", \"501-1000\", \"1001-5000\", \"5001+\". Never fabricate; leave " +
    "any field empty if you cannot find a reliable answer. Return ONLY a JSON " +
    "object matching the provided schema — no prose, no markdown, no commentary.",
  enrichment_contact:
    "You are a CRM enrichment agent. Given a contact's full name, email, " +
    "optional title, and optional company, use web_search and fetch_url to find " +
    "a likely LinkedIn profile URL (must point at linkedin.com/in/...) and a " +
    "short 1–2 sentence professional bio. If the title field is empty in the " +
    "input but you find their current role with high confidence, include it as " +
    "`title`. Never fabricate; leave fields empty if uncertain. Return ONLY a " +
    "JSON object matching the provided schema.",
};

export interface OrgPromptRow {
  key: PromptKey;
  body: string;
  is_default: boolean;
  updated_at: string | null;
}
