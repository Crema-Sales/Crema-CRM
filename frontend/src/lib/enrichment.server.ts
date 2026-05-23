import { getDB, getEnv, getExecutionCtx } from "@/db/env.server";
import { getPromptForOrg } from "@/lib/prompts.server";

/**
 * Agentic enrichment for companies and contacts.
 *
 * Triggered by createCompany / updateCompany / upsertContact in crm.functions.ts
 * via `kickOff*` helpers below — those fire-and-forget through ctx.waitUntil so
 * the originating HTTP request returns immediately. Also triggered manually
 * from the company / contact detail panes via the Refresh button server fns.
 *
 * Pipeline (two-step, deterministic):
 *   1. Gather public signal — webSearch (Tavily, optional) and a direct
 *      fetch of the company's own homepage. The contact path also fetches
 *      the candidate LinkedIn URL when the search surfaces one.
 *   2. Ask an LLM (OpenRouter, anthropic/claude-sonnet-4.5) to extract a
 *      strict JSON object from that context. The system prompt lives in
 *      organization_prompts (editable per org) and falls back to the in-code
 *      default in prompts.server.ts.
 *
 * Safety / cost rails are inherited from the same primitives the backend's
 * OSINT loop uses — 15s per-fetch timeout, 200KB body cap, people-finder
 * host blocklist. Org-level kill switch lives on organizations.enrichment_enabled.
 */

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 200_000;
const SEARCH_MAX_RESULTS = 6;
const OPENROUTER_MODEL = "anthropic/claude-sonnet-4.5";

const BLOCKED_HOSTS = new Set([
  "whitepages.com",
  "spokeo.com",
  "beenverified.com",
  "intelius.com",
  "peoplefinder.com",
  "peoplefinders.com",
  "truepeoplesearch.com",
  "fastpeoplesearch.com",
  "thatsthem.com",
  "instantcheckmate.com",
  "publicrecords.com",
  "radaris.com",
]);

function isBlockedHost(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (BLOCKED_HOSTS.has(host)) return true;
    for (const blocked of BLOCKED_HOSTS) {
      if (host.endsWith(`.${blocked}`)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return (await Promise.race([p, timeout])) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface SearchHit {
  url: string;
  title: string;
  snippet: string;
}

async function tavilySearch(apiKey: string, query: string): Promise<SearchHit[]> {
  const res = await withTimeout(
    fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: SEARCH_MAX_RESULTS,
        include_answer: false,
        search_depth: "basic",
      }),
    }),
    FETCH_TIMEOUT_MS,
    `tavily.search(${query.slice(0, 40)})`,
  );
  if (!res.ok) throw new Error(`tavily ${res.status}`);
  const body = (await res.json()) as {
    results?: Array<{ url?: string; title?: string; content?: string }>;
  };
  return (body.results ?? [])
    .filter((r) => typeof r.url === "string" && !isBlockedHost(r.url))
    .map((r) => ({
      url: r.url ?? "",
      title: r.title ?? "",
      snippet: (r.content ?? "").slice(0, 600),
    }));
}

export async function searchWeb(query: string): Promise<SearchHit[]> {
  const env = getEnv();
  if (!env.TAVILY_API_KEY) return [];
  try {
    return await tavilySearch(env.TAVILY_API_KEY, query);
  } catch (err) {
    console.warn(`[enrichment] webSearch failed:`, err);
    return [];
  }
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function htmlToText(html: string): string {
  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
  return stripTags(cleaned);
}

function extractHtmlMeta(html: string): {
  title: string | null;
  description: string | null;
  ogImage: string | null;
} {
  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  const descMatch = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html);
  const ogDescMatch = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(html);
  const ogImageMatch = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html);
  return {
    title: titleMatch ? stripTags(titleMatch[1]).slice(0, 200) : null,
    description: descMatch
      ? stripTags(descMatch[1]).slice(0, 500)
      : ogDescMatch
        ? stripTags(ogDescMatch[1]).slice(0, 500)
        : null,
    ogImage: ogImageMatch ? ogImageMatch[1].trim() : null,
  };
}

export async function fetchPageText(url: string): Promise<{
  ok: boolean;
  text: string;
  status: number;
  finalUrl: string;
  meta: { title: string | null; description: string | null; ogImage: string | null };
}> {
  const emptyMeta = { title: null, description: null, ogImage: null };
  if (isBlockedHost(url)) {
    return { ok: false, text: "", status: 451, finalUrl: url, meta: emptyMeta };
  }
  let res: Response;
  try {
    res = await withTimeout(
      fetch(url, {
        redirect: "follow",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 CremaBot/0.1",
          accept: "text/html,application/xhtml+xml,text/plain",
        },
      }),
      FETCH_TIMEOUT_MS,
      `fetch(${url.slice(0, 60)})`,
    );
  } catch (err) {
    return {
      ok: false,
      text: `(fetch failed: ${err instanceof Error ? err.message : String(err)})`,
      status: 0,
      finalUrl: url,
      meta: emptyMeta,
    };
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!/^text\/|application\/(json|xml|xhtml|rss\+xml|atom\+xml)/.test(contentType)) {
    return { ok: false, text: "", status: res.status, finalUrl: res.url, meta: emptyMeta };
  }
  const raw = await res.text();
  const clipped = raw.length > MAX_BODY_BYTES ? raw.slice(0, MAX_BODY_BYTES) : raw;
  const isHtml = /text\/html/i.test(contentType);
  return {
    ok: res.ok,
    text: isHtml ? htmlToText(clipped).slice(0, 8_000) : clipped.slice(0, 8_000),
    status: res.status,
    finalUrl: res.url,
    meta: isHtml ? extractHtmlMeta(clipped) : emptyMeta,
  };
}

/**
 * One-shot OpenRouter chat completion that asks for JSON and parses it.
 * Returns null on transport error or unparseable response.
 */
async function llmJson<T>(args: {
  apiKey: string;
  system: string;
  user: string;
  signal?: AbortSignal;
}): Promise<T | null> {
  let res: Response;
  try {
    res = await withTimeout(
      fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${args.apiKey}`,
          "content-type": "application/json",
          "x-title": "Crema CRM enrichment",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          temperature: 0.1,
          messages: [
            { role: "system", content: args.system },
            { role: "user", content: args.user },
          ],
          response_format: { type: "json_object" },
        }),
        signal: args.signal,
      }),
      30_000,
      "openrouter.chat",
    );
  } catch (err) {
    console.error("[enrichment] openrouter failed:", err);
    return null;
  }
  if (!res.ok) {
    console.error(`[enrichment] openrouter ${res.status}:`, await res.text().catch(() => ""));
    return null;
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = body.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw) return null;
  const stripped = raw.replace(/^```(?:json)?|```$/g, "").trim();
  try {
    return JSON.parse(stripped) as T;
  } catch (err) {
    console.error("[enrichment] llm response was not JSON:", raw.slice(0, 200));
    return null;
  }
}

const COMPANY_SIZE_BUCKETS = new Set([
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5001+",
]);

interface CompanyEnrichmentResult {
  website: string;
  logo_url: string;
  description: string;
  notes: string;
  ticker: string;
  size_estimate: string;
}

interface ContactEnrichmentResult {
  linkedin_url: string;
  bio: string;
  title: string;
}

function normalizeUrl(u: string | null | undefined, base?: string): string | null {
  if (!u) return null;
  const t = u.trim();
  if (!t) return null;
  try {
    return new URL(t, base).toString();
  } catch {
    return null;
  }
}

const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "live.com",
  "mac.com",
  "msn.com",
]);

export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const m = email.match(/@([a-z0-9.-]+\.[a-z]{2,})$/i);
  if (!m) return null;
  const d = m[1].toLowerCase();
  if (PERSONAL_EMAIL_DOMAINS.has(d)) return null;
  return d;
}

async function orgHasEnrichmentEnabled(orgId: string | null): Promise<boolean> {
  if (!orgId) return false;
  const row = await getDB()
    .prepare("SELECT enrichment_enabled FROM organizations WHERE id = ?")
    .bind(orgId)
    .first<{ enrichment_enabled: number }>();
  return (row?.enrichment_enabled ?? 1) === 1;
}

// ─────────────────────────────── company ───────────────────────────────

async function buildCompanyContext(name: string, domain: string | null): Promise<string> {
  const lines: string[] = [`Company name: ${name}`];
  if (domain) lines.push(`Known domain: ${domain}`);

  if (domain) {
    const homepage = await fetchPageText(`https://${domain}`);
    if (homepage.ok || homepage.meta.title) {
      lines.push("", `--- ${domain} homepage ---`);
      if (homepage.meta.title) lines.push(`<title>: ${homepage.meta.title}`);
      if (homepage.meta.description) lines.push(`<meta description>: ${homepage.meta.description}`);
      if (homepage.meta.ogImage) {
        const abs = normalizeUrl(homepage.meta.ogImage, `https://${domain}`);
        if (abs) lines.push(`<og:image>: ${abs}`);
      }
      lines.push(`Final URL: ${homepage.finalUrl}`);
      if (homepage.text) lines.push(`Body text (first ~8KB):\n${homepage.text}`);
    }
  }

  const query = domain ? `${name} ${domain} company overview` : `${name} company overview`;
  const hits = await searchWeb(query);
  if (hits.length > 0) {
    lines.push("", "--- web search results ---");
    for (const h of hits.slice(0, SEARCH_MAX_RESULTS)) {
      lines.push(`- ${h.title}\n  ${h.url}\n  ${h.snippet}`);
    }
  }

  // Cheap second search — only fires if first found nothing useful about a public listing.
  if (domain) {
    const tickerHits = await searchWeb(`"${name}" stock ticker exchange`);
    if (tickerHits.length > 0) {
      lines.push("", "--- ticker search results ---");
      for (const h of tickerHits.slice(0, 3)) {
        lines.push(`- ${h.title}\n  ${h.url}\n  ${h.snippet}`);
      }
    }
  }

  return lines.join("\n");
}

const COMPANY_JSON_INSTRUCTIONS = `
Return a JSON object with EXACTLY these keys (use empty strings if unknown — never invent):
{
  "website": "https://… or empty string",
  "logo_url": "direct image URL or empty string",
  "description": "1–2 sentence summary or empty string",
  "notes": "2–4 short bullet-style notes joined by newlines, or empty string",
  "ticker": "EXCHANGE:SYMBOL or empty string for private",
  "size_estimate": "one of: 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001+, or empty string"
}
`.trim();

async function runCompanyEnrichmentImpl(
  orgId: string | null,
  companyId: string,
): Promise<void> {
  const db = getDB();
  const env = getEnv();
  if (!env.OPENROUTER_API_KEY) {
    console.warn("[enrichment] OPENROUTER_API_KEY not set — skipping company enrichment");
    return;
  }

  await db
    .prepare("UPDATE companies SET enrichment_status = 'running' WHERE id = ?")
    .bind(companyId)
    .run();

  try {
    const company = await db
      .prepare("SELECT id, name, domain FROM companies WHERE id = ?")
      .bind(companyId)
      .first<{ id: string; name: string; domain: string | null }>();
    if (!company) throw new Error("company not found");

    const systemPrompt = await getPromptForOrg(orgId, "enrichment_company");
    const context = await buildCompanyContext(company.name, company.domain);
    const result = await llmJson<CompanyEnrichmentResult>({
      apiKey: env.OPENROUTER_API_KEY,
      system: `${systemPrompt}\n\n${COMPANY_JSON_INSTRUCTIONS}`,
      user: context,
    });

    if (!result) throw new Error("llm returned no parseable JSON");

    const website = normalizeUrl(result.website);
    const logoUrl = normalizeUrl(result.logo_url);
    const description = (result.description ?? "").trim().slice(0, 1_000) || null;
    const notes = (result.notes ?? "").trim().slice(0, 2_000) || null;
    const tickerRaw = (result.ticker ?? "").trim();
    const ticker = /^[A-Z]+:[A-Z.]+$/.test(tickerRaw) ? tickerRaw : null;
    const sizeRaw = (result.size_estimate ?? "").trim();
    const sizeEstimate = COMPANY_SIZE_BUCKETS.has(sizeRaw) ? sizeRaw : null;

    // Only fill empty fields — don't clobber human-edited values on a refresh.
    await db
      .prepare(
        `UPDATE companies SET
           website          = COALESCE(NULLIF(website, ''), ?),
           logo_url         = COALESCE(NULLIF(logo_url, ''), ?),
           description      = COALESCE(NULLIF(description, ''), ?),
           notes            = COALESCE(NULLIF(notes, ''), ?),
           ticker           = COALESCE(NULLIF(ticker, ''), ?),
           size_estimate    = COALESCE(NULLIF(size_estimate, ''), ?),
           last_enriched_at = ?,
           enrichment_status = 'ok',
           enrichment_error = NULL
         WHERE id = ?`,
      )
      .bind(website, logoUrl, description, notes, ticker, sizeEstimate, new Date().toISOString(), companyId)
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[enrichment] company ${companyId} failed:`, msg);
    await db
      .prepare(
        `UPDATE companies SET
           enrichment_status = 'error',
           enrichment_error = ?,
           last_enriched_at = ?
         WHERE id = ?`,
      )
      .bind(msg.slice(0, 500), new Date().toISOString(), companyId)
      .run();
  }
}

// ─────────────────────────────── contact ───────────────────────────────

async function buildContactContext(args: {
  fullName: string;
  email: string | null;
  title: string | null;
  companyName: string | null;
  companyDomain: string | null;
}): Promise<string> {
  const lines: string[] = [
    `Contact: ${args.fullName}`,
    args.email ? `Email: ${args.email}` : null,
    args.title ? `Current title (from CRM): ${args.title}` : null,
    args.companyName ? `Company: ${args.companyName}` : null,
    args.companyDomain ? `Company domain: ${args.companyDomain}` : null,
  ].filter((x): x is string => !!x);

  const queryParts = [`"${args.fullName}"`];
  if (args.companyName) queryParts.push(`"${args.companyName}"`);
  queryParts.push("linkedin");
  const hits = await searchWeb(queryParts.join(" "));
  if (hits.length > 0) {
    lines.push("", "--- web search results ---");
    for (const h of hits.slice(0, SEARCH_MAX_RESULTS)) {
      lines.push(`- ${h.title}\n  ${h.url}\n  ${h.snippet}`);
    }
  }

  return lines.join("\n");
}

const CONTACT_JSON_INSTRUCTIONS = `
Return a JSON object with EXACTLY these keys (use empty strings if unknown — never invent):
{
  "linkedin_url": "https://www.linkedin.com/in/... or empty string",
  "bio": "1–2 sentence professional bio or empty string",
  "title": "current job title or empty string"
}
`.trim();

async function runContactEnrichmentImpl(
  orgId: string | null,
  contactId: string,
): Promise<void> {
  const db = getDB();
  const env = getEnv();
  if (!env.OPENROUTER_API_KEY) {
    console.warn("[enrichment] OPENROUTER_API_KEY not set — skipping contact enrichment");
    return;
  }

  await db
    .prepare("UPDATE contacts SET enrichment_status = 'running' WHERE id = ?")
    .bind(contactId)
    .run();

  try {
    const row = await db
      .prepare(
        `SELECT c.id, c.full_name, c.email, c.title, c.company_id,
                co.name AS company_name, co.domain AS company_domain
         FROM contacts c
         LEFT JOIN companies co ON co.id = c.company_id
         WHERE c.id = ?`,
      )
      .bind(contactId)
      .first<{
        id: string;
        full_name: string;
        email: string | null;
        title: string | null;
        company_id: string | null;
        company_name: string | null;
        company_domain: string | null;
      }>();
    if (!row) throw new Error("contact not found");

    const systemPrompt = await getPromptForOrg(orgId, "enrichment_contact");
    const context = await buildContactContext({
      fullName: row.full_name,
      email: row.email,
      title: row.title,
      companyName: row.company_name,
      companyDomain: row.company_domain,
    });
    const result = await llmJson<ContactEnrichmentResult>({
      apiKey: env.OPENROUTER_API_KEY,
      system: `${systemPrompt}\n\n${CONTACT_JSON_INSTRUCTIONS}`,
      user: context,
    });
    if (!result) throw new Error("llm returned no parseable JSON");

    const linkedinRaw = (result.linkedin_url ?? "").trim();
    const linkedin =
      linkedinRaw && /linkedin\.com\/in\//i.test(linkedinRaw)
        ? normalizeUrl(linkedinRaw)
        : null;
    const bio = (result.bio ?? "").trim().slice(0, 1_000) || null;
    const titleFromLlm = (result.title ?? "").trim().slice(0, 200) || null;

    await db
      .prepare(
        `UPDATE contacts SET
           linkedin_url     = COALESCE(NULLIF(linkedin_url, ''), ?),
           bio              = COALESCE(NULLIF(bio, ''), ?),
           title            = COALESCE(NULLIF(title, ''), ?),
           last_enriched_at = ?,
           enrichment_status = 'ok',
           enrichment_error = NULL
         WHERE id = ?`,
      )
      .bind(linkedin, bio, titleFromLlm, new Date().toISOString(), contactId)
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[enrichment] contact ${contactId} failed:`, msg);
    await db
      .prepare(
        `UPDATE contacts SET
           enrichment_status = 'error',
           enrichment_error = ?,
           last_enriched_at = ?
         WHERE id = ?`,
      )
      .bind(msg.slice(0, 500), new Date().toISOString(), contactId)
      .run();
  }
}

// ──────────────────────── public fire-and-forget API ────────────────────────

/**
 * Schedule a company enrichment to run after the originating HTTP response
 * is sent. Runs on a background task in the Worker via ctx.waitUntil.
 */
export function kickOffCompanyEnrichment(
  orgId: string | null,
  companyId: string,
): void {
  const ctx = getExecutionCtx();
  if (!ctx) {
    void runCompanyEnrichmentImpl(orgId, companyId).catch(() => {});
    return;
  }
  ctx.waitUntil(
    (async () => {
      const enabled = await orgHasEnrichmentEnabled(orgId);
      if (!enabled) return;
      await runCompanyEnrichmentImpl(orgId, companyId);
    })().catch((err) => console.error("[enrichment] company kickoff failed:", err)),
  );
}

export function kickOffContactEnrichment(
  orgId: string | null,
  contactId: string,
): void {
  const ctx = getExecutionCtx();
  if (!ctx) {
    void runContactEnrichmentImpl(orgId, contactId).catch(() => {});
    return;
  }
  ctx.waitUntil(
    (async () => {
      const enabled = await orgHasEnrichmentEnabled(orgId);
      if (!enabled) return;
      await runContactEnrichmentImpl(orgId, contactId);
    })().catch((err) => console.error("[enrichment] contact kickoff failed:", err)),
  );
}

/**
 * Manual Refresh button variants. They also dispatch via ctx.waitUntil — the
 * UI just polls last_enriched_at to see when the row updates. The kill
 * switch is bypassed for explicit refresh requests (user intent over
 * org default).
 */
export function refreshCompanyEnrichment(
  orgId: string | null,
  companyId: string,
): void {
  const ctx = getExecutionCtx();
  if (!ctx) {
    void runCompanyEnrichmentImpl(orgId, companyId).catch(() => {});
    return;
  }
  ctx.waitUntil(
    runCompanyEnrichmentImpl(orgId, companyId).catch((err) =>
      console.error("[enrichment] company refresh failed:", err),
    ),
  );
}

export function refreshContactEnrichment(
  orgId: string | null,
  contactId: string,
): void {
  const ctx = getExecutionCtx();
  if (!ctx) {
    void runContactEnrichmentImpl(orgId, contactId).catch(() => {});
    return;
  }
  ctx.waitUntil(
    runContactEnrichmentImpl(orgId, contactId).catch((err) =>
      console.error("[enrichment] contact refresh failed:", err),
    ),
  );
}
