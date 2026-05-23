import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CustomerCreate,
  CustomerPatch,
  CustomerStatus,
  LeadPatch,
  LeadStage,
  TicketPatch,
  TicketStatus,
} from "@crema/shared";
import { z } from "zod";
import type { Env } from "./index";
import { buildTools, type RepTools } from "./agent-tools";

/**
 * `mcp.ts` — the same tool catalog from `agent-tools.ts`, exposed as a
 * Model Context Protocol server. The CLI, the browser extension, and any
 * external agentic client (Claude Desktop, the MCP inspector, etc.) speak
 * to this surface; the chat WS uses the same tools via Vercel's AI SDK in
 * `agent.ts`. One menu, one auth path (the rep JWT), one audit trail.
 *
 * The tool *logic* (HTTP calls back to `/v1/*` over the `SELF` service
 * binding, JWT in `Authorization: Bearer …`) is reused verbatim from
 * `buildTools`. Only the parameter shapes are re-declared here because
 * `McpServer.tool` wants a ZodRawShape rather than a wrapped `ZodObject`.
 *
 * Auth: the Worker's top-level fetch handler verifies the rep JWT and
 * threads `{ jwt, repId }` through `ctx.props` (Cloudflare Agents convention).
 * MCP requests without a valid Bearer JWT never reach this DO.
 *
 * Storage parity: tools fetch the same `/v1/*` endpoints the chat copilot
 * does. The seeded fixtures in `seed.ts` are in-process module state, so
 * a note appended via chat is visible to a subsequent `getTimeline` from
 * MCP and vice versa.
 */

export interface RepMcpProps extends Record<string, unknown> {
  jwt: string;
  repId: string;
}

// ──────── Parameter shapes ──────────────────────────────────────────────────

const PaginationShape = {
  cursor: z.string().optional().describe("Opaque pagination cursor from a prior list response"),
  limit: z.number().int().min(1).max(100).optional().describe("Items per page (1-100, default 25)"),
};

const ListCustomersShape = {
  q: z.string().optional().describe("Free-text search across name and email"),
  status: CustomerStatus.optional().describe("Filter by customer status"),
  ...PaginationShape,
};

const CustomerIdShape = {
  id: z.string().describe("Customer id, e.g. `cus_001`"),
};

const CreateCustomerShape = CustomerCreate.shape;

const UpdateCustomerShape = {
  id: z.string().describe("Customer id to update"),
  patch: CustomerPatch.describe("Partial customer fields to overwrite"),
};

const TimelineShape = {
  id: z.string().describe("Customer id whose timeline to read"),
  ...PaginationShape,
};

const AddNoteShape = {
  id: z.string().describe("Customer id to attach the note to"),
  body: z.string().min(1).describe("Note text"),
};

const ListLeadsShape = {
  stage: LeadStage.optional().describe("Filter by pipeline stage"),
  ...PaginationShape,
};

const UpdateLeadShape = {
  id: z.string().describe("Lead id, e.g. `lead_002`"),
  patch: LeadPatch.describe("Partial lead fields (stage / ltvEstimate / ownerId)"),
};

const LeadIdShape = {
  leadId: z.string().describe("Lead id, e.g. `lead_002`"),
};

const ListTicketsShape = {
  status: TicketStatus.optional().describe("Filter by status"),
  ...PaginationShape,
};

const UpdateTicketShape = {
  id: z.string().describe("Ticket id, e.g. `tkt_001`"),
  patch: TicketPatch.describe("Partial ticket fields (status / priority / slaBreached / summary / closedAt)"),
};

const ScheduleReminderShape = {
  when: z
    .union([z.string(), z.number()])
    .describe(
      "ISO-8601 datetime (`2026-05-19T17:30:00Z`), seconds-delay number (`30`), or cron expression (`0 9 * * *`)",
    ),
  what: z.string().min(1).describe("Reminder text"),
};

// ──────── Adapter glue ──────────────────────────────────────────────────────

type ExecuteFn = (args: unknown) => Promise<unknown>;

function executeOf<K extends keyof RepTools>(tools: RepTools, name: K): ExecuteFn {
  const t = tools[name] as unknown as {
    execute?: (args: unknown, opts: unknown) => Promise<unknown>;
  };
  if (typeof t.execute !== "function") {
    throw new Error(`MCP tool ${String(name)} has no execute function`);
  }
  const execute = t.execute;
  return async (args: unknown) =>
    execute(args, { toolCallId: `mcp:${String(name)}`, messages: [] });
}

function asTextResult(value: unknown): {
  content: { type: "text"; text: string }[];
} {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "null";
  return { content: [{ type: "text" as const, text }] };
}

export class RepMcp extends McpAgent<Env, unknown, RepMcpProps> {
  server = new McpServer({ name: "crema-rep", version: "0.1.0" });

  async init(): Promise<void> {
    const jwt = this.props?.jwt;
    if (!jwt) {
      throw new Error("RepMcp.init: missing jwt in props");
    }

    const tools = buildTools(this.env, jwt, this);

    // ── me ──
    this.server.tool(
      "getMe",
      "Return the current rep's identity (id, email, name) and the WS hint.",
      async () => asTextResult(await executeOf(tools, "getMe")({})),
    );

    this.server.tool(
      "getDashboard",
      "Aggregate counters for the rep's dashboard: open tickets, open leads, total customers.",
      async () => asTextResult(await executeOf(tools, "getDashboard")({})),
    );

    this.server.tool(
      "getSummaryToday",
      "Today's Morning Cup markdown summary, if the daily cron has produced one.",
      async () => asTextResult(await executeOf(tools, "getSummaryToday")({})),
    );

    this.server.tool(
      "prioritizedActions",
      "Ranked queue of the rep's top items right now — open leads, breached tickets, overdue check-ins. Call this first for open-ended 'what should I do' / morning-cup framings.",
      async () => asTextResult(await executeOf(tools, "prioritizedActions")({})),
    );

    // ── customers ──
    this.server.tool(
      "listCustomers",
      "List customers (paginated). Optional free-text search across name+email, and optional status filter.",
      ListCustomersShape,
      async (args) => asTextResult(await executeOf(tools, "listCustomers")(args)),
    );

    this.server.tool(
      "getCustomer",
      "Fetch one customer record by id (e.g. `cus_001`).",
      CustomerIdShape,
      async (args) => asTextResult(await executeOf(tools, "getCustomer")(args)),
    );

    this.server.tool(
      "createCustomer",
      "Create a new customer. `name` and `email` are required.",
      CreateCustomerShape,
      async (args) => asTextResult(await executeOf(tools, "createCustomer")(args)),
    );

    this.server.tool(
      "updateCustomer",
      "Patch a customer (name, email, phone, status, assignedTo, companyId). Only the fields in `patch` are changed.",
      UpdateCustomerShape,
      async (args) => asTextResult(await executeOf(tools, "updateCustomer")(args)),
    );

    this.server.tool(
      "deleteCustomer",
      "Soft-delete a customer. DESTRUCTIVE — only use when the rep explicitly asks to remove a customer.",
      CustomerIdShape,
      async (args) => asTextResult(await executeOf(tools, "deleteCustomer")(args)),
    );

    this.server.tool(
      "getTimeline",
      "Fetch the activity timeline for a customer (newest first, paginated).",
      TimelineShape,
      async (args) => asTextResult(await executeOf(tools, "getTimeline")(args)),
    );

    this.server.tool(
      "addNote",
      "Append a manual note to a customer's timeline. Use this to log a call, a thought, or a follow-up reminder.",
      AddNoteShape,
      async (args) => asTextResult(await executeOf(tools, "addNote")(args)),
    );

    // ── leads ──
    this.server.tool(
      "listLeads",
      "List leads (paginated). Optional stage filter: new | contacted | qualified | proposal | won | lost.",
      ListLeadsShape,
      async (args) => asTextResult(await executeOf(tools, "listLeads")(args)),
    );

    this.server.tool(
      "updateLead",
      "Patch a lead — move stage, update LTV, or reassign owner. Only the fields in `patch` are changed.",
      UpdateLeadShape,
      async (args) => asTextResult(await executeOf(tools, "updateLead")(args)),
    );

    this.server.tool(
      "draftFollowUp",
      "Generate a follow-up draft for a lead. Returns the draft text — does NOT send. The rep reviews and sends themselves.",
      LeadIdShape,
      async (args) => asTextResult(await executeOf(tools, "draftFollowUp")(args)),
    );

    // ── tickets ──
    this.server.tool(
      "listTickets",
      "List support tickets (paginated). Optional status filter: open | pending | closed.",
      ListTicketsShape,
      async (args) => asTextResult(await executeOf(tools, "listTickets")(args)),
    );

    this.server.tool(
      "updateTicket",
      "Patch a ticket — change status, priority, SLA flag, summary, or close it (set closedAt to an ISO datetime). Only the fields in `patch` are changed.",
      UpdateTicketShape,
      async (args) => asTextResult(await executeOf(tools, "updateTicket")(args)),
    );

    // ── scheduler ──
    this.server.tool(
      "scheduleReminder",
      "Schedule a proactive reminder. `when` is an ISO-8601 datetime, a seconds-delay number, or a cron expression. `what` is the short reminder text the rep will see when it fires.",
      ScheduleReminderShape,
      async (args) => asTextResult(await executeOf(tools, "scheduleReminder")(args)),
    );
  }
}
