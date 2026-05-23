import { tool } from "ai";
import { z } from "zod";
import { ProspectAffinities } from "@crema/shared/schemas/research";
import type { Env } from "./index";

/**
 * `osint-tools.ts` — the toolset the inner research loop hands to the LLM.
 *
 * Four tools:
 *   - `webSearch(query)`       → returns ranked snippets + URLs
 *   - `fetchUrl(url)`          → returns page text (capped, plain-text)
 *   - `findSocialProfiles(name, company?)` → site:-scoped searches across
 *                                              LinkedIn / X / GitHub / Bluesky
 *   - `saveAffinities(...)`    → terminator: writes the final structured
 *                                            affinities back to the calling
 *                                            DO via the closure
 *
 * Search backend: Tavily (TAVILY_API_KEY). Tavily was picked over Brave/Serper
 * because their JSON shape is the closest to what the LLM actually wants to
 * see: a flat list of {url, title, content_snippet}. If no key is configured,
 * we fall back to a duckduckgo-html scrape that pulls hrefs out of the search
 * results page — useful enough to demo without provisioning a secret, but the
 * caller should configure Tavily for real runs.
 *
 * Safety rails:
 *   - All HTTP calls are time-boxed (15s).
 *   - fetchUrl caps response bodies at 200KB and strips HTML to plain text.
 *   - We refuse to fetch obvious private-data targets (people-finder sites,
 *     phone-number scrapers, address-lookup services) — see `BLOCKED_HOSTS`.
 */

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 200_000;
const SEARCH_MAX_RESULTS = 8;

/**
 * Domains we refuse to touch even via fetchUrl. These are the "people-finder"
 * services that aggregate addresses, phone numbers, household members,
 * relatives — the stuff that turns prospect research into a privacy
 * violation. The agent isn't blocked from learning a hometown from someone's
 * LinkedIn — it's blocked from looking them up on whitepages.com.
 */
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

async function tavilySearch(env: Env, query: string): Promise<SearchHit[]> {
  const apiKey = env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY not configured");
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
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`tavily ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as { results?: Array<{ url?: string; title?: string; content?: string }> };
  const results = body.results ?? [];
  return results
    .filter((r) => typeof r.url === "string" && !isBlockedHost(r.url))
    .map((r) => ({
      url: r.url ?? "",
      title: r.title ?? "",
      snippet: (r.content ?? "").slice(0, 600),
    }));
}

/**
 * Last-resort fallback when no TAVILY_API_KEY is configured. Scrapes a few
 * outbound links from DuckDuckGo's HTML results page so the demo flow still
 * works without provisioning a secret. Brittle by design — if Tavily is
 * worth $0 for the production run, configure it.
 */
async function duckduckgoFallbackSearch(query: string): Promise<SearchHit[]> {
  const u = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await withTimeout(
    fetch(u, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 CremaBot/0.1",
      },
    }),
    FETCH_TIMEOUT_MS,
    `ddg.search(${query.slice(0, 40)})`,
  );
  if (!res.ok) {
    throw new Error(`duckduckgo fallback ${res.status}`);
  }
  const html = (await res.text()).slice(0, 200_000);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const linkRe =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]{0,600}?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null && hits.length < SEARCH_MAX_RESULTS) {
    const href = decodeDdgRedirect(m[1] ?? "");
    if (!href || seen.has(href) || isBlockedHost(href)) continue;
    seen.add(href);
    hits.push({
      url: href,
      title: stripTags(m[2] ?? "").slice(0, 200),
      snippet: stripTags(m[3] ?? "").slice(0, 600),
    });
  }
  return hits;
}

function decodeDdgRedirect(href: string): string {
  if (href.startsWith("//")) href = `https:${href}`;
  try {
    const u = new URL(href);
    if (u.hostname.endsWith("duckduckgo.com") && u.pathname === "/l/") {
      const target = u.searchParams.get("uddg");
      if (target) return decodeURIComponent(target);
    }
    return href;
  } catch {
    return "";
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

export async function searchWeb(env: Env, query: string): Promise<SearchHit[]> {
  if (env.TAVILY_API_KEY) {
    return tavilySearch(env, query);
  }
  return duckduckgoFallbackSearch(query);
}

async function fetchPageText(url: string): Promise<{ ok: boolean; text: string; status: number; finalUrl: string }> {
  if (isBlockedHost(url)) {
    return { ok: false, text: `(blocked host: ${url})`, status: 451, finalUrl: url };
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
    };
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!/^text\/|application\/(json|xml|xhtml|rss\+xml|atom\+xml)/.test(contentType)) {
    return {
      ok: false,
      text: `(non-text content-type: ${contentType})`,
      status: res.status,
      finalUrl: res.url,
    };
  }
  const raw = await res.text();
  const clipped = raw.length > MAX_BODY_BYTES ? raw.slice(0, MAX_BODY_BYTES) : raw;
  const isHtml = /text\/html/i.test(contentType);
  const text = isHtml ? htmlToText(clipped) : clipped;
  return { ok: res.ok, text, status: res.status, finalUrl: res.url };
}

function htmlToText(html: string): string {
  const noScripts = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<head\b[\s\S]*?<\/head>/gi, " ");
  return stripTags(noScripts);
}

export interface AffinitySink {
  save: (affinities: ProspectAffinities) => void;
}

/**
 * Builds the toolset for one research run. The `sink` is a closure-captured
 * one-shot — `saveAffinities` calls `sink.save(...)` and returns
 * `{ saved: true }` so the LLM stops looping. The DO reads the captured
 * affinities after `generateText` returns.
 */
export function buildOsintTools(env: Env, sink: AffinitySink) {
  return {
    webSearch: tool({
      description:
        "Search the public web for information about the prospect. Returns up to 8 hits with title, URL, and a short content snippet. Use specific queries — name + employer, name + interest topic, name + city.",
      inputSchema: z.object({
        query: z.string().min(2).describe("Search query — be specific, prefer site:-style operators when helpful"),
      }),
      execute: async ({ query }) => {
        try {
          const hits = await searchWeb(env, query);
          return { ok: true, hits };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            hits: [] as SearchHit[],
          };
        }
      },
    }),

    fetchUrl: tool({
      description:
        "Fetch a single web page and return its plain-text content (HTML stripped, capped at ~200KB). Use this after `webSearch` to read pages that look promising. Refuses people-finder / address-aggregator sites.",
      inputSchema: z.object({
        url: z.string().url().describe("Full https URL"),
      }),
      execute: async ({ url }) => fetchPageText(url),
    }),

    findSocialProfiles: tool({
      description:
        "Find a prospect's likely social profiles across LinkedIn, X/Twitter, GitHub, Bluesky, and Mastodon. Runs site:-scoped searches under the hood. Returns ranked URL candidates with confidence.",
      inputSchema: z.object({
        name: z.string().min(2).describe("Full name of the prospect"),
        company: z.string().optional().describe("Current employer, if known — improves disambiguation"),
      }),
      execute: async ({ name, company }) => {
        const platforms = [
          { name: "linkedin", site: "linkedin.com/in" },
          { name: "x", site: "x.com" },
          { name: "twitter", site: "twitter.com" },
          { name: "github", site: "github.com" },
          { name: "bluesky", site: "bsky.app" },
          { name: "mastodon", site: "mastodon.social" },
        ];
        const out: Array<{ platform: string; url: string; title: string; snippet: string }> = [];
        for (const p of platforms) {
          const q = company
            ? `site:${p.site} "${name}" "${company}"`
            : `site:${p.site} "${name}"`;
          try {
            const hits = await searchWeb(env, q);
            for (const h of hits.slice(0, 2)) {
              out.push({ platform: p.name, url: h.url, title: h.title, snippet: h.snippet });
            }
          } catch {
            // single-platform failure is fine — keep iterating
          }
        }
        return { ok: true, candidates: out };
      },
    }),

    saveAffinities: tool({
      description:
        "TERMINATOR — call exactly once with your final, structured findings. Every claim in the personal or family blocks must reference at least one URL in `sources`. After calling this, do not call any more tools.",
      inputSchema: ProspectAffinities,
      execute: async (affinities) => {
        sink.save(affinities);
        return {
          saved: true,
          message:
            "Affinities recorded. Do not call more tools — the research run is complete.",
        };
      },
    }),
  };
}

export type OsintTools = ReturnType<typeof buildOsintTools>;
