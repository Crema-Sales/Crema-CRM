import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  ErrorBody,
  GiftDraft,
  GiftDraftListResponse,
  GiftDraftRequest,
  ResearchJobListResponse,
  ResearchJobResponse,
  ResearchJobResult,
  ResearchStartRequest,
  ResearchStartResponse,
} from "@crema/shared";
import * as db from "../db";
import type { Env } from "../index";
import type { RepIdentity } from "../auth";
import { errorBody } from "./_util";

/**
 * `routes/research.ts` — the OSINT prospect-research surface.
 *
 * Lifecycle of a job:
 *   1. Rep (or the agent on the rep's behalf) POSTs /v1/customers/:id/research.
 *      We create a `pending` ResearchJob row in D1 and fire-and-forget the
 *      work into the rep's RepAgent DO (`/research/run`). The HTTP response
 *      returns 202 immediately with the new job id so a chat tool isn't
 *      sitting on a ~30s synchronous call.
 *   2. The DO runs an inner agentic loop with `web_search` + `fetch_url`,
 *      structures the result, and PATCHes us back at
 *      /v1/customers/:id/research/:job_id with the final affinities.
 *   3. The PATCH appends an `agent_action` activity row via `db.appendActivity`
 *      which publishes a `customer.events` SSE — both the UI timeline and any
 *      live chat copilot context get the update without polling.
 *
 * Gift drafts (`/gift-drafts`) read from the latest completed job and
 * synthesize a single, citable, ship-ready idea + draft note for the rep
 * to sign off on. No external send — the rep ships the gift themselves.
 */

type AppEnv = { Bindings: Env; Variables: { rep: RepIdentity } };

const CustomerIdParam = z.object({
  id: z
    .string()
    .openapi({ param: { name: "id", in: "path" }, example: "cus_001" }),
});

const JobParam = z.object({
  id: z
    .string()
    .openapi({ param: { name: "id", in: "path" }, example: "cus_001" }),
  job_id: z
    .string()
    .openapi({ param: { name: "job_id", in: "path" }, example: "rsh_01HQK9" }),
});

const jobsListQuery = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  })
  .openapi("ResearchListQuery");

const startRoute = createRoute({
  method: "post",
  path: "/v1/customers/{id}/research",
  tags: ["research"],
  summary: "Kick off an OSINT prospect-research run",
  request: {
    params: CustomerIdParam,
    body: {
      required: false,
      content: { "application/json": { schema: ResearchStartRequest } },
    },
  },
  responses: {
    202: {
      description: "Job accepted — poll the job id to follow status",
      content: { "application/json": { schema: ResearchStartResponse } },
    },
    404: {
      description: "Customer not found",
      content: { "application/json": { schema: ErrorBody } },
    },
  },
});

const listJobsRoute = createRoute({
  method: "get",
  path: "/v1/customers/{id}/research",
  tags: ["research"],
  summary: "List research jobs for a customer (newest first)",
  request: { params: CustomerIdParam, query: jobsListQuery },
  responses: {
    200: {
      description: "Paginated job list",
      content: { "application/json": { schema: ResearchJobListResponse } },
    },
    404: {
      description: "Customer not found",
      content: { "application/json": { schema: ErrorBody } },
    },
  },
});

const getJobRoute = createRoute({
  method: "get",
  path: "/v1/customers/{id}/research/{job_id}",
  tags: ["research"],
  summary: "Read one research job by id",
  request: { params: JobParam },
  responses: {
    200: {
      description: "Job record (with affinities once complete)",
      content: { "application/json": { schema: ResearchJobResponse } },
    },
    404: {
      description: "Job or customer not found",
      content: { "application/json": { schema: ErrorBody } },
    },
  },
});

const patchJobRoute = createRoute({
  method: "patch",
  path: "/v1/customers/{id}/research/{job_id}",
  tags: ["research"],
  summary:
    "Update a research job's terminal state (used by the RepAgent DO when the inner loop finishes)",
  request: {
    params: JobParam,
    body: {
      required: true,
      content: { "application/json": { schema: ResearchJobResult } },
    },
  },
  responses: {
    200: {
      description: "Updated job",
      content: { "application/json": { schema: ResearchJobResponse } },
    },
    404: {
      description: "Job not found",
      content: { "application/json": { schema: ErrorBody } },
    },
    422: {
      description: "Validation failed",
      content: { "application/json": { schema: ErrorBody } },
    },
  },
});

const createGiftRoute = createRoute({
  method: "post",
  path: "/v1/customers/{id}/gift-drafts",
  tags: ["research"],
  summary: "Synthesize a single ship-ready gift idea from the latest research",
  request: {
    params: CustomerIdParam,
    body: {
      required: false,
      content: { "application/json": { schema: GiftDraftRequest } },
    },
  },
  responses: {
    201: {
      description: "Gift draft created",
      content: { "application/json": { schema: GiftDraft } },
    },
    404: {
      description: "Customer not found",
      content: { "application/json": { schema: ErrorBody } },
    },
    409: {
      description: "No completed research job yet — kick one off first",
      content: { "application/json": { schema: ErrorBody } },
    },
  },
});

const listGiftsRoute = createRoute({
  method: "get",
  path: "/v1/customers/{id}/gift-drafts",
  tags: ["research"],
  summary: "List gift drafts for a customer (newest first)",
  request: { params: CustomerIdParam, query: jobsListQuery },
  responses: {
    200: {
      description: "Paginated gift draft list",
      content: { "application/json": { schema: GiftDraftListResponse } },
    },
    404: {
      description: "Customer not found",
      content: { "application/json": { schema: ErrorBody } },
    },
  },
});

export const researchRoutes = new OpenAPIHono<AppEnv>();

researchRoutes.openapi(startRoute, async (c) => {
  const { id } = c.req.valid("param");
  const customer = await db.getCustomer(c.env, id);
  if (!customer) {
    return c.json(errorBody("not_found", `customer ${id} not found`), 404);
  }
  const body = (await c.req.json().catch(() => ({}))) as { hint?: string };
  const hint = body?.hint?.trim() ? body.hint.trim().slice(0, 500) : null;

  const rep = c.get("rep");
  const job = await db.startResearchJob(c.env, {
    customerId: id,
    repId: rep.repId,
    hint,
  });

  // Fire-and-forget dispatch into the rep's RepAgent DO. The DO runs the
  // inner OSINT loop and PATCHes us back when it finishes. We deliberately
  // do NOT await — the API returns 202 immediately so the agent's chat
  // tool isn't sitting on a 30s synchronous call. The dispatch carries a
  // forwarded copy of the rep JWT so a freshly-woken DO can still
  // authenticate its self-calls back into /v1/*.
  const authHeader = c.req.header("authorization") ?? "";
  const dispatch = async () => {
    const doId = c.env.AGENT.idFromName(rep.repId);
    const stub = c.env.AGENT.get(doId);
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (authHeader) {
      const m = authHeader.match(/^Bearer\s+(.+)$/i);
      if (m) headers["x-rep-jwt"] = m[1].trim();
    }
    try {
      await stub.fetch("http://internal/research/run", {
        method: "POST",
        headers,
        body: JSON.stringify({
          jobId: job.id,
          customerId: id,
          customerName: customer.name,
          customerEmail: customer.email,
          companyName: null,
          hint,
        }),
      });
    } catch (err) {
      // Mark the job failed so the rep doesn't stare at a hung "pending".
      await db.completeResearchJob(c.env, id, job.id, {
        status: "failed",
        error: `dispatch_failed: ${err instanceof Error ? err.message : String(err)}`,
        steps: 0,
      });
    }
  };
  c.executionCtx.waitUntil(dispatch());

  return c.json({ job }, 202);
});

researchRoutes.openapi(listJobsRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { cursor, limit } = c.req.valid("query");
  const customer = await db.getCustomer(c.env, id);
  if (!customer) {
    return c.json(errorBody("not_found", `customer ${id} not found`), 404);
  }
  const page = await db.listResearchJobs(c.env, id, { cursor, limit });
  return c.json(page, 200);
});

researchRoutes.openapi(getJobRoute, async (c) => {
  const { id, job_id } = c.req.valid("param");
  const job = await db.getResearchJob(c.env, id, job_id);
  if (!job) {
    return c.json(errorBody("not_found", `research job ${job_id} not found`), 404);
  }
  return c.json({ job }, 200);
});

researchRoutes.openapi(patchJobRoute, async (c) => {
  const { id, job_id } = c.req.valid("param");
  const result = c.req.valid("json");
  const updated = await db.completeResearchJob(c.env, id, job_id, result);
  if (!updated) {
    return c.json(errorBody("not_found", `research job ${job_id} not found`), 404);
  }

  // Drop a timeline row so the rep sees the research land. appendActivity
  // also publishes the customer SSE so any open UI / agent context updates
  // without polling.
  const summary = updated.status === "complete" && updated.affinities
    ? truncateForBody(updated.affinities.summary)
    : `Research failed: ${updated.error ?? "(no detail)"}`;
  await db.appendActivity(c.env, {
    customerId: id,
    type: "agent_action",
    body: `Prospect research ${updated.status} — ${summary}`,
    source: "agent",
    actorId: `agent_${updated.repId}`,
  });

  return c.json({ job: updated }, 200);
});

researchRoutes.openapi(createGiftRoute, async (c) => {
  const { id } = c.req.valid("param");
  const customer = await db.getCustomer(c.env, id);
  if (!customer) {
    return c.json(errorBody("not_found", `customer ${id} not found`), 404);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    researchJobId?: string;
    priceBand?: "$" | "$$" | "$$$";
    hint?: string;
  };

  const job = body.researchJobId
    ? await db.getResearchJob(c.env, id, body.researchJobId)
    : await db.latestCompleteResearchJob(c.env, id);

  if (!job || job.status !== "complete" || !job.affinities) {
    return c.json(
      errorBody(
        "conflict",
        "no completed research job for this customer yet — call POST /v1/customers/:id/research first",
      ),
      409,
    );
  }

  const affinities = job.affinities;
  const targetBand = body.priceBand ?? null;
  const candidatesByBand = affinities.giftIdeas.filter(
    (g) => !targetBand || g.priceBand === targetBand,
  );
  const pick = (candidatesByBand[0] ?? affinities.giftIdeas[0]) ?? null;

  // Fallback synthesis: if the agent produced affinities but no gift ideas
  // (rare — the prompt requires them), assemble a generic-but-honest idea
  // from the strongest single signal rather than hard-erroring.
  const idea = pick ?? synthesizeFallbackIdea(affinities, targetBand, body.hint);
  if (!idea) {
    return c.json(
      errorBody(
        "conflict",
        "research found no gift-actionable signals — nothing to draft against",
      ),
      409,
    );
  }

  const draftNote = composeDraftNote(customer.name, affinities);

  const record = await db.insertGiftDraft(c.env, {
    customerId: id,
    repId: job.repId,
    researchJobId: job.id,
    idea: idea.idea,
    rationale: idea.rationale,
    priceBand: idea.priceBand,
    suggestedVendor: null,
    draftNote,
    sourceUrls: idea.sourceUrls,
  });

  await db.appendActivity(c.env, {
    customerId: id,
    type: "agent_action",
    body: `Drafted gift idea: ${record.idea}`,
    source: "agent",
    actorId: `agent_${job.repId}`,
  });

  return c.json(record, 201);
});

researchRoutes.openapi(listGiftsRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { cursor, limit } = c.req.valid("query");
  const customer = await db.getCustomer(c.env, id);
  if (!customer) {
    return c.json(errorBody("not_found", `customer ${id} not found`), 404);
  }
  const page = await db.listGiftDrafts(c.env, id, { cursor, limit });
  return c.json(page, 200);
});

function truncateForBody(s: string): string {
  const t = s.trim();
  return t.length > 240 ? `${t.slice(0, 237)}…` : t;
}

function synthesizeFallbackIdea(
  affinities: {
    personal: { sportsTeams: string[]; hobbies: string[] };
    sources: { url: string }[];
  },
  band: "$" | "$$" | "$$$" | null,
  hint: string | undefined,
): { idea: string; rationale: string; priceBand: "$" | "$$" | "$$$"; sourceUrls: string[] } | null {
  const firstSrc = affinities.sources[0]?.url;
  if (!firstSrc) return null;
  const sport = affinities.personal.sportsTeams[0];
  const hobby = affinities.personal.hobbies[0];
  if (sport) {
    return {
      idea: `${sport} branded gift (book, mug, or game tickets depending on budget)`,
      rationale: `Public signal of ${sport} fandom — safe gift angle without any personal/family detail.`,
      priceBand: band ?? "$$",
      sourceUrls: [firstSrc],
    };
  }
  if (hobby) {
    return {
      idea: `Quality ${hobby} accessory or experience${hint ? ` (${hint})` : ""}`,
      rationale: `Public signal of ${hobby} interest.`,
      priceBand: band ?? "$$",
      sourceUrls: [firstSrc],
    };
  }
  return null;
}

function composeDraftNote(fullName: string, affinities: { summary: string }): string {
  const firstName = fullName.split(/\s+/)[0] ?? fullName;
  const opener = affinities.summary.split(/\.\s+/)[0] ?? "Saw something that made me think of you";
  return [
    `Hey ${firstName} —`,
    ``,
    `${opener}.`,
    ``,
    `Saw this and thought of you. No pitch, no ask — just a "saw your post, wanted to send something." Talk soon.`,
  ].join("\n");
}
