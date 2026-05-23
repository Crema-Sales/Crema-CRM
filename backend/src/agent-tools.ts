import { tool } from "ai";
import { z } from "zod";
import {
  CustomerCreate,
  CustomerPatch,
  CustomerStatus,
  LeadPatch,
  LeadStage,
  TicketPatch,
  TicketStatus,
} from "@crema/shared";
import type { Env } from "./index";
import { readRepIdFromJwt } from "./auth";
import { getSiteAdapterOverride, upsertSiteAdapterOverride } from "./db";
import {
  DEFAULT_ADAPTERS,
  listKnownSites,
  mergeAdapter,
  resolveSiteForHost,
  type SiteAdapter,
  type SiteElement,
} from "./site-adapters";

/**
 * Anything with a Cloudflare Agents-style `schedule(...)` method. RepAgent and
 * RepMcp both satisfy this — keeps `buildTools` decoupled from the concrete
 * DO class. The reminder callback name (`"reminder"`) only fires successfully
 * on an Agent whose class actually defines a `reminder()` method (currently
 * `RepAgent`); MCP-scheduled reminders that route through the McpAgent DO
 * are a Phase 06+ concern.
 */
export interface ScheduleHost {
  schedule<T>(
    when: Date | string | number,
    callback: string,
    payload?: T,
  ): Promise<{ id: string }>;
}

/**
 * `agent-tools.ts` — the copilot's tool catalog. The catalog is meant to be
 * **full surface parity with the UI** so a rep who only ever talks to the
 * agent can still get anything done. Every `/v1/*` endpoint is exposed as a
 * tool, plus the DO scheduler for proactive reminders. Update both this file
 * and `AGENTS-AGENTS.md` if you add or rename a tool.
 *
 * Topology: each tool that touches CRM data calls back into this same Worker
 * over the `SELF` service binding (or `INTERNAL_API_BASE` as a dev fallback),
 * carrying the rep's JWT in the `Authorization` header. The Worker's own
 * `requireRep` middleware then authenticates the call exactly as it would
 * for a request from the UI — the copilot is just another API client wearing
 * the rep's badge. `scheduleReminder` is the one tool that does not hit the
 * API; it calls `agent.schedule(...)` on the `agents` SDK scheduler.
 */

const NoArgs = z.object({}).optional();

/**
 * Fire one request at the Worker's own routes. Prefers the `SELF` service
 * binding (prod) and falls back to `INTERNAL_API_BASE` / localhost (dev).
 * Carries the rep's JWT so `requireRep` authenticates the call exactly as a
 * UI request would. Shared by `api()` (CRM `/v1/*`) and `browserAct()`.
 */
async function dispatchFetch(
  env: Env,
  jwt: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "content-type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  if (env.SELF) {
    return env.SELF.fetch(new URL(path, "http://internal/").toString(), init);
  }
  const base = env.INTERNAL_API_BASE && env.INTERNAL_API_BASE.length > 0
    ? env.INTERNAL_API_BASE
    : "http://localhost:8787/";
  return fetch(new URL(path, base).toString(), init);
}

async function api(
  env: Env,
  jwt: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await dispatchFetch(env, jwt, method, path, body);

  // 204 No Content is a valid success that yields an empty body.
  if (res.status === 204) {
    return { ok: true, status: 204 };
  }

  const text = await res.text();
  let parsed: unknown = text;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // leave parsed = text; LLM gets the raw payload
    }
  } else {
    parsed = null;
  }
  if (!res.ok) {
    return { error: { status: res.status, body: parsed } };
  }
  return parsed;
}

/**
 * Drive the rep's browser through the companion extension. POSTs one command
 * to `/agents/:repId/act`; the `RepExtension` DO forwards it to the live
 * WebSocket and waits for the ack. Returns the command result on success, or
 * a `{ ok:false, error, hint }` shape the LLM can read and relay to the rep
 * (extension offline, master switch off, selector miss, …).
 */
async function browserAct(
  env: Env,
  jwt: string,
  repId: string,
  type: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  if (!repId) {
    return {
      ok: false,
      error: "no_rep_id",
      hint: "Could not resolve the rep id for this session — browser control is unavailable.",
    };
  }
  const res = await dispatchFetch(
    env,
    jwt,
    "POST",
    `/agents/${encodeURIComponent(repId)}/act`,
    { type, params },
  );
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // leave body = text
  }
  const obj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  if (res.status === 409 || obj.error === "rep_disabled") {
    return {
      ok: false,
      error: "rep_disabled",
      hint: "The extension's master switch is OFF. Ask the rep to click the Crema coffee-cup icon in their Chrome toolbar so it shows the green ON badge, then retry.",
    };
  }
  if (obj.queued === true) {
    return {
      ok: false,
      error: "extension_offline",
      hint: "The rep's browser extension isn't connected — the command was queued, not executed. Ask them to open Chrome with the Crema extension installed and enabled.",
    };
  }
  if (!res.ok || obj.ok === false) {
    return {
      ok: false,
      error: typeof obj.error === "string" ? obj.error : `http_${res.status}`,
      hint: "The browser command failed. Re-read the page to confirm your selector is real, or tell the rep what went wrong.",
    };
  }
  // `/act` wraps a successful extension reply as `{ ok:true, result }`.
  return obj.result ?? obj;
}

function normalizeWhen(when: string | number): Date | string | number {
  if (typeof when === "number") return when;
  const trimmed = when.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  // Five+ whitespace-separated tokens looks like a cron expression — pass through.
  if (trimmed.split(/\s+/).length >= 5) return trimmed;
  const t = Date.parse(trimmed);
  if (!Number.isNaN(t)) return new Date(t);
  return trimmed;
}

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (entries.length === 0) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of entries) sp.set(k, String(v));
  return `?${sp.toString()}`;
}

const PaginationArgs = {
  cursor: z.string().optional().describe("Opaque pagination cursor from a prior list response"),
  limit: z.number().int().min(1).max(100).optional().describe("Items per page (1-100, default 25)"),
};

/**
 * Where to send a rep whose browser extension isn't connected. Derived from
 * the first allowlisted UI origin so it tracks the deployed frontend rather
 * than hardcoding the domain.
 */
function extensionInstallUrl(env: Env): string {
  const origin = (env.UI_ORIGIN ?? "").split(",")[0]?.trim() || "https://cremasales.com";
  return `${origin.replace(/\/+$/, "")}/extension/onboard`;
}

export function buildTools(env: Env, jwt: string, agent: ScheduleHost) {
  // The browser tools address `/agents/:repId/act`; repId is the JWT subject.
  const repId = readRepIdFromJwt(jwt) ?? "";
  return {
    // ──────────────── me ────────────────
    getMe: tool({
      description: "Return the current rep's identity (id, email, name) and the WS hint.",
      inputSchema: NoArgs,
      execute: async () => api(env, jwt, "GET", "/v1/me"),
    }),

    getDashboard: tool({
      description:
        "Aggregate counters for the rep's dashboard: open tickets, open leads, total customers.",
      inputSchema: NoArgs,
      execute: async () => api(env, jwt, "GET", "/v1/me/dashboard"),
    }),

    getSummaryToday: tool({
      description:
        "Today's Morning Cup markdown summary, if the daily cron has produced one. 404 if not yet generated.",
      inputSchema: NoArgs,
      execute: async () => api(env, jwt, "GET", "/v1/me/summary/today"),
    }),

    prioritizedActions: tool({
      description:
        "Ranked queue of the rep's top items right now — open leads, breached tickets, overdue check-ins. Call this first for open-ended 'what should I do' / morning-cup framings.",
      inputSchema: NoArgs,
      execute: async () => api(env, jwt, "GET", "/v1/actions"),
    }),

    // ──────────────── customers ────────────────
    listCustomers: tool({
      description:
        "List customers (paginated). Optional free-text search across name+email, and optional status filter. With no filters, returns all customers assigned to the rep.",
      inputSchema: z.object({
        q: z.string().optional().describe("Free-text search across name and email"),
        status: CustomerStatus.optional().describe(
          "Filter by status: prospect | active | dormant | churn_risk | churned",
        ),
        ...PaginationArgs,
      }),
      execute: async ({ q, status, cursor, limit }) =>
        api(env, jwt, "GET", `/v1/customers${qs({ q, status, cursor, limit })}`),
    }),

    getCustomer: tool({
      description: "Fetch one customer record by id (e.g. `cus_001`).",
      inputSchema: z.object({
        id: z.string().describe("Customer id, e.g. `cus_001`"),
      }),
      execute: async ({ id }) =>
        api(env, jwt, "GET", `/v1/customers/${encodeURIComponent(id)}`),
    }),

    createCustomer: tool({
      description:
        "Create a new customer. `name` and `email` are required. Other fields default sensibly (status=prospect, assignedTo=me).",
      inputSchema: CustomerCreate,
      execute: async (input) => api(env, jwt, "POST", "/v1/customers", input),
    }),

    updateCustomer: tool({
      description:
        "Patch a customer (name, email, phone, status, assignedTo, companyId). Only the fields in `patch` are changed.",
      inputSchema: z.object({
        id: z.string().describe("Customer id to update"),
        patch: CustomerPatch.describe("Partial customer fields to overwrite"),
      }),
      execute: async ({ id, patch }) =>
        api(env, jwt, "PATCH", `/v1/customers/${encodeURIComponent(id)}`, patch),
    }),

    deleteCustomer: tool({
      description:
        "Soft-delete a customer. DESTRUCTIVE — only use when the rep explicitly asks to remove a customer. Returns 204 on success.",
      inputSchema: z.object({
        id: z.string().describe("Customer id to delete"),
      }),
      execute: async ({ id }) =>
        api(env, jwt, "DELETE", `/v1/customers/${encodeURIComponent(id)}`),
    }),

    getTimeline: tool({
      description: "Fetch the activity timeline for a customer (newest first, paginated).",
      inputSchema: z.object({
        id: z.string().describe("Customer id whose timeline to read"),
        ...PaginationArgs,
      }),
      execute: async ({ id, cursor, limit }) =>
        api(
          env,
          jwt,
          "GET",
          `/v1/customers/${encodeURIComponent(id)}/timeline${qs({ cursor, limit })}`,
        ),
    }),

    addNote: tool({
      description:
        "Append a manual note to a customer's timeline. Use this to log a call, a thought, or a follow-up reminder.",
      inputSchema: z.object({
        id: z.string().describe("Customer id to attach the note to"),
        body: z.string().min(1).describe("Note text"),
      }),
      execute: async ({ id, body }) =>
        api(env, jwt, "POST", `/v1/customers/${encodeURIComponent(id)}/notes`, { body }),
    }),

    // ──────────────── leads ────────────────
    listLeads: tool({
      description:
        "List leads (paginated). Optional stage filter: new | contacted | qualified | proposal | won | lost.",
      inputSchema: z.object({
        stage: LeadStage.optional().describe("Filter by pipeline stage"),
        ...PaginationArgs,
      }),
      execute: async ({ stage, cursor, limit }) =>
        api(env, jwt, "GET", `/v1/leads${qs({ stage, cursor, limit })}`),
    }),

    updateLead: tool({
      description:
        "Patch a lead — move pipeline stage, update LTV estimate, or reassign owner. Only the fields in `patch` are changed.",
      inputSchema: z.object({
        id: z.string().describe("Lead id, e.g. `lead_002`"),
        patch: LeadPatch.describe("Partial lead fields to overwrite (stage / ltvEstimate / ownerId)"),
      }),
      execute: async ({ id, patch }) =>
        api(env, jwt, "PATCH", `/v1/leads/${encodeURIComponent(id)}`, patch),
    }),

    draftFollowUp: tool({
      description:
        "Generate a follow-up draft for a lead. Returns the draft text — does NOT send. The rep reviews and sends themselves.",
      inputSchema: z.object({
        leadId: z.string().describe("Lead id (e.g. `lead_002`)"),
      }),
      execute: async ({ leadId }) =>
        api(env, jwt, "POST", `/v1/leads/${encodeURIComponent(leadId)}/drafts`),
    }),

    // ──────────────── tickets ────────────────
    listTickets: tool({
      description:
        "List support tickets (paginated). Optional status filter: open | pending | closed. With no filter, returns all statuses.",
      inputSchema: z.object({
        status: TicketStatus.optional().describe("Filter by status"),
        ...PaginationArgs,
      }),
      execute: async ({ status, cursor, limit }) =>
        api(env, jwt, "GET", `/v1/tickets${qs({ status, cursor, limit })}`),
    }),

    updateTicket: tool({
      description:
        "Patch a ticket — change status, priority, SLA flag, summary, or close it (set closedAt to an ISO datetime). Only the fields in `patch` are changed.",
      inputSchema: z.object({
        id: z.string().describe("Ticket id, e.g. `tkt_001`"),
        patch: TicketPatch.describe(
          "Partial ticket fields to overwrite (status / priority / slaBreached / summary / closedAt)",
        ),
      }),
      execute: async ({ id, patch }) =>
        api(env, jwt, "PATCH", `/v1/tickets/${encodeURIComponent(id)}`, patch),
    }),

    // ──────────────── research ────────────────
    researchProspect: tool({
      description:
        "Kick off an OSINT prospect-research run for a customer. Returns immediately with the job id — the inner loop runs in the background (~30s). Use `getResearch` to read the result once the job completes. The result is *gift-actionable signals*: sports teams, hobbies, recent posts/talks, family interests — every claim cites a source URL.",
      inputSchema: z.object({
        customerId: z.string().describe("Customer id, e.g. `cus_001`"),
        hint: z
          .string()
          .max(500)
          .optional()
          .describe(
            "Optional free-text steer for the researcher ('focus on the hockey angle', 'find his Goodreads').",
          ),
      }),
      execute: async ({ customerId, hint }) =>
        api(
          env,
          jwt,
          "POST",
          `/v1/customers/${encodeURIComponent(customerId)}/research`,
          hint ? { hint } : {},
        ),
    }),

    getResearch: tool({
      description:
        "Fetch a research job's status and (once complete) the structured ProspectAffinities. Call this after `researchProspect` returned a job id, polling every few seconds until status === 'complete'.",
      inputSchema: z.object({
        customerId: z.string().describe("Customer id the job belongs to"),
        jobId: z.string().describe("Job id returned by `researchProspect`"),
      }),
      execute: async ({ customerId, jobId }) =>
        api(
          env,
          jwt,
          "GET",
          `/v1/customers/${encodeURIComponent(customerId)}/research/${encodeURIComponent(jobId)}`,
        ),
    }),

    listResearch: tool({
      description:
        "List prior research jobs for a customer (newest first). Useful when the rep asks 'what have we already dug up on them?'.",
      inputSchema: z.object({
        customerId: z.string().describe("Customer id"),
        ...PaginationArgs,
      }),
      execute: async ({ customerId, cursor, limit }) =>
        api(
          env,
          jwt,
          "GET",
          `/v1/customers/${encodeURIComponent(customerId)}/research${qs({ cursor, limit })}`,
        ),
    }),

    draftGift: tool({
      description:
        "Synthesize a specific, ship-ready gift idea + draft note for a customer from their latest completed research. Returns the GiftDraft for the rep to review. Refuses if no completed research exists — call `researchProspect` first.",
      inputSchema: z.object({
        customerId: z.string().describe("Customer id"),
        priceBand: z
          .enum(["$", "$$", "$$$"])
          .optional()
          .describe("Optional cap: `$` (<$75), `$$` ($75-$300), `$$$` ($300+)"),
        hint: z
          .string()
          .max(300)
          .optional()
          .describe("Optional steer, e.g. 'something for his daughter'"),
        researchJobId: z
          .string()
          .optional()
          .describe(
            "Specific research job to draft from. Defaults to the most recent complete job.",
          ),
      }),
      execute: async ({ customerId, priceBand, hint, researchJobId }) =>
        api(
          env,
          jwt,
          "POST",
          `/v1/customers/${encodeURIComponent(customerId)}/gift-drafts`,
          { priceBand, hint, researchJobId },
        ),
    }),

    listGiftDrafts: tool({
      description:
        "List previously-drafted gift ideas for a customer (newest first).",
      inputSchema: z.object({
        customerId: z.string().describe("Customer id"),
        ...PaginationArgs,
      }),
      execute: async ({ customerId, cursor, limit }) =>
        api(
          env,
          jwt,
          "GET",
          `/v1/customers/${encodeURIComponent(customerId)}/gift-drafts${qs({ cursor, limit })}`,
        ),
    }),

    // ──────────────── browser control ────────────────
    browserStatus: tool({
      description:
        "Check whether you can drive the rep's browser and what you can do with it. Call this before any browser task, AND whenever the rep asks what you're capable of, whether you can see/control their browser, or which sites you can work. Returns: `connected` (extension running), `enabled` (master switch on), `ready` (both), `sitesWithAdapters` (sites you have tuned selector maps for — you can attempt other sites too, just less reliably), and `installUrl` (only when not connected — send the rep there to install the extension).",
      inputSchema: NoArgs,
      execute: async () => {
        const sitesWithAdapters = Object.values(DEFAULT_ADAPTERS).map((a) => a.label);
        const installUrl = extensionInstallUrl(env);
        if (!repId) {
          return {
            connected: false,
            enabled: false,
            ready: false,
            sitesWithAdapters,
            installUrl,
            summary: `Could not resolve the rep session, so browser control is unavailable. Ask the rep to install and connect the extension at ${installUrl}.`,
          };
        }
        const res = await dispatchFetch(
          env,
          jwt,
          "GET",
          `/agents/${encodeURIComponent(repId)}/status`,
        );
        let connected = false;
        let enabled = false;
        let queueDepth = 0;
        if (res.ok) {
          try {
            const b = (await res.json()) as {
              online?: boolean;
              enabled?: boolean;
              queueDepth?: number;
            };
            connected = b.online === true;
            enabled = b.enabled === true;
            queueDepth = typeof b.queueDepth === "number" ? b.queueDepth : 0;
          } catch {
            // unparseable body — treat as not connected
          }
        }
        const ready = connected && enabled;
        const summary = !connected
          ? `The Crema browser extension isn't connected — you can't drive the browser yet. Send the rep to ${installUrl} to install it and link it to their account.`
          : !enabled
            ? "The extension is connected but the master switch is OFF. Ask the rep to click the Crema coffee-cup icon in their Chrome toolbar so it shows the green ON badge."
            : `Ready to drive the browser. Tuned site adapters: ${sitesWithAdapters.join(", ")} — other sites work too, just expect more DOM-reading.`;
        return {
          connected,
          enabled,
          ready,
          queueDepth,
          sitesWithAdapters,
          ...(connected ? {} : { installUrl }),
          summary,
        };
      },
    }),

    browserOpen: tool({
      description:
        "Open a URL in the rep's browser. Omit `tabId` to open a NEW tab — the result includes a `tabId` you MUST reuse for every follow-up command on that page. Pass an existing `tabId` to navigate that tab instead. Waits for the page to finish loading before returning.",
      inputSchema: z.object({
        url: z.string().describe("Absolute URL to open, e.g. https://www.linkedin.com/feed/"),
        tabId: z
          .number()
          .int()
          .optional()
          .describe("Existing tab to navigate; omit to open a new tab"),
      }),
      execute: async ({ url, tabId }) =>
        browserAct(env, jwt, repId, "navigate", { url, tabId }),
    }),

    browserReadPage: tool({
      description:
        "Read the live DOM (outer HTML) of a tab — your eyes on the page. Call this after opening or interacting, BEFORE every click/type, so your CSS selectors are real and not guessed. `tabId` comes from `browserOpen`.",
      inputSchema: z.object({
        tabId: z.number().int().describe("Tab id returned by browserOpen"),
        maxBytes: z
          .number()
          .int()
          .min(1000)
          .max(1_000_000)
          .optional()
          .describe("Cap on returned HTML in bytes (default 1MB)"),
      }),
      execute: async ({ tabId, maxBytes }) =>
        browserAct(env, jwt, repId, "snapshot", { tabId, max_bytes: maxBytes }),
    }),

    browserClick: tool({
      description:
        "Click an element in a tab, located by CSS selector. Read the page first (`browserReadPage`) to pick a precise selector. Fails with `selector_not_found` if nothing matches.",
      inputSchema: z.object({
        tabId: z.number().int().describe("Tab id from browserOpen"),
        selector: z.string().describe("CSS selector of the element to click"),
      }),
      execute: async ({ tabId, selector }) =>
        browserAct(env, jwt, repId, "click", { tabId, selector }),
    }),

    browserType: tool({
      description:
        "Type text into an input, textarea, or contenteditable element located by CSS selector. Replaces the field's current value. Read the page first to find the selector. For an outbound message, show the rep the text and get a go-ahead before sending the first one.",
      inputSchema: z.object({
        tabId: z.number().int().describe("Tab id from browserOpen"),
        selector: z.string().describe("CSS selector of the field"),
        text: z.string().describe("Text to enter into the field"),
      }),
      execute: async ({ tabId, selector, text }) =>
        browserAct(env, jwt, repId, "type", { tabId, selector, text }),
    }),

    // ──────────────── site adapters ────────────────
    getSiteAdapter: tool({
      description:
        "Look up the saved selector map for a known site (LinkedIn, Gmail, Outlook/Office) before driving it. Pass the page host or URL. Returns the site's element selectors, home URL, and notes — use these instead of guessing selectors from raw DOM. If a saved selector turns out stale, correct it with `saveSiteAdapter`. Unknown hosts return `known:false` — you can still drive them, just find selectors yourself with `browserReadPage`.",
      inputSchema: z.object({
        host: z
          .string()
          .describe("Page hostname or full URL, e.g. www.linkedin.com or https://mail.google.com/"),
      }),
      execute: async ({ host }) => {
        const site = resolveSiteForHost(host);
        if (!site) {
          return {
            known: false,
            supportedSites: listKnownSites(),
            hint: "No saved adapter for this host. Drive it directly: browserReadPage, find selectors yourself.",
          };
        }
        const base = DEFAULT_ADAPTERS[site];
        const override = await getSiteAdapterOverride(env, site);
        return { known: true, adapter: mergeAdapter(base, override) };
      },
    }),

    saveSiteAdapter: tool({
      description:
        "Discovery mode: persist corrected selectors for a known site after you've read its live DOM and confirmed them. Pass only the elements you actually verified — they merge onto the existing map, untouched elements are kept. Run this whenever a selector from `getSiteAdapter` missed and you found the real one, so the next run (for any rep) starts correct. Keep element names consistent with the existing adapter.",
      inputSchema: z.object({
        site: z
          .string()
          .describe("Site key from getSiteAdapter, e.g. linkedin | gmail | office"),
        elements: z
          .record(
            z.string(),
            z.object({
              selector: z
                .string()
                .describe("Working CSS selector you confirmed against the live DOM"),
              description: z.string().describe("What this element is"),
            }),
          )
          .describe(
            "Map of element name -> {selector, description}. Names should match the existing adapter (global_search, message_box, send_button, …).",
          ),
        notes: z
          .string()
          .optional()
          .describe("Optional refreshed free-text guidance about the site"),
      }),
      execute: async ({ site, elements, notes }) => {
        const base = DEFAULT_ADAPTERS[site];
        if (!base) {
          return { ok: false, error: "unknown_site", supportedSites: listKnownSites() };
        }
        const current = mergeAdapter(base, await getSiteAdapterOverride(env, site));
        const merged: Record<string, SiteElement> = { ...current.elements };
        for (const [name, el] of Object.entries(elements)) {
          merged[name] = { selector: el.selector, description: el.description, verified: true };
        }
        const updated: SiteAdapter = {
          ...current,
          notes: notes ?? current.notes,
          elements: merged,
          source: "discovered",
          updatedAt: new Date().toISOString(),
        };
        await upsertSiteAdapterOverride(env, updated, repId);
        return { ok: true, site, savedElements: Object.keys(elements), adapter: updated };
      },
    }),

    // ──────────────── scheduler ────────────────
    scheduleReminder: tool({
      description:
        "Schedule a proactive reminder. `when` is an ISO-8601 datetime, a seconds-delay number, or a cron expression. `what` is the short reminder text the rep will see when it fires.",
      inputSchema: z.object({
        when: z
          .union([z.string(), z.number()])
          .describe(
            "ISO-8601 datetime (`2026-05-19T17:30:00Z`), seconds-delay number (`30`), or cron expression (`0 9 * * *`)",
          ),
        what: z.string().min(1).describe("Reminder text"),
      }),
      execute: async ({ when, what }) => {
        const normalized = normalizeWhen(when);
        const sched = await agent.schedule(normalized, "reminder", { what });
        return { scheduled: true, id: sched.id, when: normalized, what };
      },
    }),
  };
}

export type RepTools = ReturnType<typeof buildTools>;
