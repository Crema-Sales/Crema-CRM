import { getDB } from "@/db/env.server";
import {
  DEFAULT_PROMPTS,
  PROMPT_KEYS,
  type OrgPromptRow,
  type PromptKey,
} from "@/lib/prompts";

/**
 * Server-only read helpers for the prompt catalog defined in `prompts.ts`.
 * Reads merge per-org overrides from `organization_prompts` with the
 * in-code defaults, and additionally honor the legacy
 * `organizations.system_prompt` column for the org_overlay key so
 * existing agent flows keep working unchanged.
 */

export async function getPromptForOrg(
  orgId: string | null,
  key: PromptKey,
): Promise<string> {
  const fallback = DEFAULT_PROMPTS[key];
  if (!orgId) return fallback;
  const row = await getDB()
    .prepare("SELECT body FROM organization_prompts WHERE org_id = ? AND prompt_key = ?")
    .bind(orgId, key)
    .first<{ body: string }>();
  if (row?.body) return row.body;
  if (key === "org_overlay") {
    const legacy = await getDB()
      .prepare("SELECT system_prompt FROM organizations WHERE id = ?")
      .bind(orgId)
      .first<{ system_prompt: string | null }>();
    if (legacy?.system_prompt) return legacy.system_prompt;
  }
  return fallback;
}

export async function listOrgPromptsForOrg(orgId: string): Promise<OrgPromptRow[]> {
  const db = getDB();
  const [promptsRes, orgRes] = await Promise.all([
    db
      .prepare(
        "SELECT prompt_key, body, updated_at FROM organization_prompts WHERE org_id = ?",
      )
      .bind(orgId)
      .all<{ prompt_key: string; body: string; updated_at: string }>(),
    db
      .prepare("SELECT system_prompt FROM organizations WHERE id = ?")
      .bind(orgId)
      .first<{ system_prompt: string | null }>(),
  ]);
  const overrideMap = new Map(promptsRes.results.map((r) => [r.prompt_key, r]));
  return PROMPT_KEYS.map((key) => {
    const override = overrideMap.get(key);
    if (override) {
      return {
        key,
        body: override.body,
        is_default: false,
        updated_at: override.updated_at,
      };
    }
    if (key === "org_overlay" && orgRes?.system_prompt) {
      return {
        key,
        body: orgRes.system_prompt,
        is_default: false,
        updated_at: null,
      };
    }
    return {
      key,
      body: DEFAULT_PROMPTS[key],
      is_default: true,
      updated_at: null,
    };
  });
}
