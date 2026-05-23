import { AIChatAgent } from "@cloudflare/ai-chat";
import type { Connection, ConnectionContext } from "agents";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import type {
  Activity,
  PrioritizedAction,
  ProspectAffinities,
  ResearchJobResult,
  Ticket,
} from "@crema/shared";
import type { Env } from "./index";
import {
  DAILY_SUMMARY_PROMPT,
  RESEARCH_RUN_PROMPT,
  RESEARCH_SYSTEM_PROMPT,
  buildSystemPrompt,
} from "./agent-prompts";
import { readCoachSlugFromJwt, readSystemPromptsFromJwt } from "./auth";
import { buildTools } from "./agent-tools";
import { describeProvider, getModel } from "./llm";
import { buildOsintTools } from "./osint-tools";

const REP_JWT_STORAGE_KEY = "rep:jwt";
const REP_JWT_HEADER = "x-rep-jwt";

/**
 * RepAgent — per-rep AI copilot. One DO instance per `sales_rep_id`,
 * addressed via `env.AGENT.idFromName(repId)`. Hosts both the chat copilot
 * (via this `AIChatAgent` surface) and, later, the extension-control
 * surface in the same DO. See `agents-agents.md`.
 *
 * Phase 04 wires the persona prompt, the 9-tool catalog from `agent-tools.ts`,
 * and the JWT-threaded self-call topology. The rep's JWT is read from the
 * `x-rep-jwt` header on every WS upgrade (set by the Worker's default
 * handler in `index.ts` after `verifyRepJwt`) and persisted to DO storage so
 * the streaming lifecycle and hibernation wakes can still authenticate
 * self-calls back into `/v1/*` routes.
 */
export class RepAgent extends AIChatAgent<Env> {
  private repJwt: string | null = null;

  async onStart(): Promise<void> {
    if (this.repJwt) return;
    const stored = await this.ctx.storage.get<string>(REP_JWT_STORAGE_KEY);
    if (stored) this.repJwt = stored;
  }

  async onConnect(_connection: Connection, ctx: ConnectionContext): Promise<void> {
    const jwt = ctx.request.headers.get(REP_JWT_HEADER);
    if (!jwt) return;
    this.repJwt = jwt;
    await this.ctx.storage.put(REP_JWT_STORAGE_KEY, jwt);
  }

  async onChatMessage(): Promise<Response | undefined> {
    try {
      const jwt = await this.getRepJwt();
      if (!jwt) {
        return providerErrorResponse(
          "[auth] no rep JWT on this connection — reconnect with a valid ?token=<jwt>",
          this.messages,
        );
      }

      const model = getModel(this.env);
      console.log(`[RepAgent] provider=${describeProvider(this.env)}`);

      const tools = buildTools(this.env, jwt, this);
      const coachSlug = readCoachSlugFromJwt(jwt);
      const { orgPrompt, userPrompt } = readSystemPromptsFromJwt(jwt);
      const system = buildSystemPrompt(coachSlug, { orgPrompt, userPrompt });

      const result = streamText({
        model,
        system,
        messages: await convertToModelMessages(this.messages),
        tools,
        // 17-tool catalog → realistic multi-step plans (list → fetch → patch).
        // 10 steps comfortably absorbs chains like "list my customers, fetch
        // each timeline, draft follow-ups for the stale ones" without runaway.
        stopWhen: stepCountIs(10),
      });

      return result.toUIMessageStreamResponse({
        originalMessages: this.messages,
        onError: (err) => formatProviderError(err),
      });
    } catch (err) {
      return providerErrorResponse(formatProviderError(err), this.messages);
    }
  }

  async reminder(payload: { what: string }): Promise<void> {
    const what = payload?.what ?? "(reminder)";
    const message: UIMessage = {
      id: `assistant_reminder_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      role: "assistant",
      parts: [
        {
          type: "text",
          text: `Heads up — you asked me to ping you about: ${what}`,
        },
      ],
    };
    await this.persistMessages([...this.messages, message]);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/cron/daily") {
      // The cron caller forges a per-rep JWT and threads it via x-rep-jwt
      // so a freshly-woken DO that's never seen a chat connection can still
      // authenticate self-calls into /v1/*. Persist it so subsequent runs
      // (or the chat path) don't need to be re-handed the JWT.
      const cronJwt = request.headers.get(REP_JWT_HEADER);
      if (cronJwt) {
        this.repJwt = cronJwt;
        await this.ctx.storage.put(REP_JWT_STORAGE_KEY, cronJwt);
      }
      const markdown = await this.runDailySummary();
      return Response.json({ ok: true, markdown });
    }
    if (url.pathname === "/internal/extension-toggled" && request.method === "POST") {
      // Cross-DO ping from `RepExtension` when the rep flips the popup master
      // switch ON. We append a short assistant message so the chat surfaces
      // "I'm back" — connected clients receive it through the AIChatAgent's
      // own broadcast, so the rep doesn't need to re-prompt to resume.
      const body = (await request.json().catch(() => null)) as { enabled?: boolean } | null;
      if (body?.enabled === true) {
        const message: UIMessage = {
          id: `assistant_ext_on_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          role: "assistant",
          parts: [
            {
              type: "text",
              text: "Browser control is **on** — I can drive your browser now. What would you like me to pick up?",
            },
          ],
        };
        await this.persistMessages([...this.messages, message]);
      }
      return Response.json({ ok: true });
    }
    if (url.pathname === "/internal/summary/today") {
      const key = `daily_summary:${utcDateKey(new Date())}`;
      const markdown = await this.ctx.storage.get<string>(key);
      if (!markdown) {
        return Response.json(
          { error: { code: "not_found", message: "no summary for today yet" } },
          { status: 404 },
        );
      }
      return Response.json({ markdown });
    }
    if (url.pathname === "/research/run" && request.method === "POST") {
      // The Worker route forwards the rep's bearer token via x-rep-jwt so a
      // freshly-woken DO can self-call /v1/* — same trick the cron path uses.
      const incomingJwt = request.headers.get(REP_JWT_HEADER);
      if (incomingJwt && this.repJwt !== incomingJwt) {
        this.repJwt = incomingJwt;
        await this.ctx.storage.put(REP_JWT_STORAGE_KEY, incomingJwt);
      }
      const body = (await request.json().catch(() => null)) as {
        jobId?: string;
        customerId?: string;
        customerName?: string;
        customerEmail?: string;
        companyName?: string | null;
        hint?: string | null;
      } | null;
      if (!body?.jobId || !body.customerId || !body.customerName || !body.customerEmail) {
        return Response.json(
          { error: { code: "validation_failed", message: "missing job context" } },
          { status: 422 },
        );
      }
      // Run the inner loop in the background so the dispatcher's
      // ctx.waitUntil promise doesn't have to hold the entire ~30s research
      // window open. The DO has its own waitUntil semantics via ctx.waitUntil.
      this.ctx.waitUntil(
        this.runResearch({
          jobId: body.jobId,
          customerId: body.customerId,
          customerName: body.customerName,
          customerEmail: body.customerEmail,
          companyName: body.companyName ?? null,
          hint: body.hint ?? null,
        }),
      );
      return Response.json({ ok: true, jobId: body.jobId }, { status: 202 });
    }
    return super.fetch(request);
  }

  /**
   * One research run. Drives the inner OSINT loop via `generateText` with the
   * tools from `osint-tools.ts`, captures the affinities the LLM saves via
   * `saveAffinities`, then PATCHes the result back into the public route so
   * the seed store (and, later, D1) sees a terminal job. A failure is
   * reported the same way — `status: "failed"` plus an `error` string.
   */
  private async runResearch(args: {
    jobId: string;
    customerId: string;
    customerName: string;
    customerEmail: string;
    companyName: string | null;
    hint: string | null;
  }): Promise<void> {
    const startedAt = Date.now();
    let captured: ProspectAffinities | null = null;
    let steps = 0;
    let error: string | null = null;

    try {
      const jwt = await this.getRepJwt();
      if (!jwt) {
        throw new Error(
          "RepAgent.runResearch: no rep JWT stored — start the run via the public API so the dispatcher forwards a token",
        );
      }
      const model = getModel(this.env);
      console.log(
        `[RepAgent] research start jobId=${args.jobId} customerId=${args.customerId} provider=${describeProvider(this.env)}`,
      );
      const tools = buildOsintTools(this.env, {
        save: (a) => {
          captured = a;
        },
      });
      const result = await generateText({
        model,
        system: RESEARCH_SYSTEM_PROMPT,
        prompt: RESEARCH_RUN_PROMPT({
          customerName: args.customerName,
          customerEmail: args.customerEmail,
          companyName: args.companyName,
          hint: args.hint,
        }),
        tools,
        // Six tool-call steps is plenty for: 2 searches + 2 fetches + a
        // social-profile sweep + saveAffinities. Going wider tends to
        // produce diminishing returns (and more hallucination risk) on
        // public-info tasks.
        stopWhen: stepCountIs(8),
      });
      steps = result.steps?.length ?? 0;
      if (!captured) {
        // If the LLM finished without calling saveAffinities, surface that
        // as a soft failure — we don't want to dump unstructured text into
        // the affinities slot. Capture the last assistant text in the
        // error string so a rep can see what the model "wanted to say."
        const tail = result.text?.trim().slice(0, 400) ?? "";
        error = tail
          ? `inner loop finished without saveAffinities — tail: ${tail}`
          : "inner loop finished without saveAffinities";
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[RepAgent] research end jobId=${args.jobId} steps=${steps} elapsedMs=${elapsedMs} ok=${captured !== null}`,
    );

    const payload: ResearchJobResult = captured
      ? { status: "complete", affinities: captured, steps }
      : { status: "failed", error: error ?? "unknown failure", steps };

    try {
      await this.patchResearchJob(args.customerId, args.jobId, payload);
    } catch (err) {
      console.log(
        `[RepAgent] research patch-back failed jobId=${args.jobId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async patchResearchJob(
    customerId: string,
    jobId: string,
    payload: ResearchJobResult,
  ): Promise<void> {
    const jwt = await this.getRepJwt();
    if (!jwt) throw new Error("no rep JWT for research patch-back");
    const path = `/v1/customers/${encodeURIComponent(customerId)}/research/${encodeURIComponent(jobId)}`;
    const init: RequestInit = {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    };
    const url = new URL(path, "http://internal/").toString();
    const res = this.env.SELF
      ? await this.env.SELF.fetch(url, init)
      : await fetch(
          new URL(
            path,
            this.env.INTERNAL_API_BASE && this.env.INTERNAL_API_BASE.length > 0
              ? this.env.INTERNAL_API_BASE
              : "http://localhost:8787/",
          ).toString(),
          init,
        );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`PATCH ${path} → ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  private async runDailySummary(): Promise<string> {
    const jwt = await this.getRepJwt();
    if (!jwt) {
      throw new Error("RepAgent.runDailySummary: no rep JWT stored — rep must connect over WS at least once first");
    }
    const actions = await this.fetchInternal<{ items: PrioritizedAction[] }>(jwt, "/v1/actions");
    const tickets = await this.fetchInternal<{ items: Ticket[] }>(jwt, "/v1/tickets?status=open");
    // Yesterday's timeline is left empty in Phase 05 — we have no per-rep
    // activity scan endpoint yet. The prompt template tolerates an empty array.
    const yesterday: Activity[] = [];

    const prompt = DAILY_SUMMARY_PROMPT(
      Array.isArray(actions?.items) ? actions.items : [],
      Array.isArray(tickets?.items) ? tickets.items : [],
      yesterday,
    );

    const model = getModel(this.env);
    console.log(`[RepAgent] daily-summary provider=${describeProvider(this.env)}`);
    const coachSlug = readCoachSlugFromJwt(jwt);
    const { orgPrompt, userPrompt } = readSystemPromptsFromJwt(jwt);
    const system = buildSystemPrompt(coachSlug, { orgPrompt, userPrompt });
    let markdown: string;
    try {
      const { text } = await generateText({ model, system, prompt });
      markdown = text.trim().length > 0 ? text : "(no summary)";
    } catch (err) {
      // LLM provider failures (e.g. an unconfigured AI Gateway in local dev)
      // shouldn't blow up the cron — store a deterministic fallback so the
      // dashboard still has a summary card. Real provider issues surface in
      // logs; we don't want the entire fan-out to fail because one rep's
      // model call errored out.
      console.log(
        `[RepAgent] daily-summary LLM failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      markdown = `## Morning Cup\n\n_LLM unavailable; falling back to the deterministic queue._\n\n${prompt}`;
    }
    const key = `daily_summary:${utcDateKey(new Date())}`;
    await this.ctx.storage.put(key, markdown);
    return markdown;
  }

  private async fetchInternal<T>(jwt: string, path: string): Promise<T | null> {
    const init: RequestInit = {
      method: "GET",
      headers: { Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    };
    const url = new URL(path, "http://internal/").toString();
    const res = this.env.SELF
      ? await this.env.SELF.fetch(url, init)
      : await fetch(
          new URL(
            path,
            this.env.INTERNAL_API_BASE && this.env.INTERNAL_API_BASE.length > 0
              ? this.env.INTERNAL_API_BASE
              : "http://localhost:8787/",
          ).toString(),
          init,
        );
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length === 0) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  private async getRepJwt(): Promise<string | null> {
    if (this.repJwt) return this.repJwt;
    const stored = await this.ctx.storage.get<string>(REP_JWT_STORAGE_KEY);
    if (stored) this.repJwt = stored;
    return this.repJwt;
  }
}

function utcDateKey(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatProviderError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `[provider error] ${message} — falling back to echo`;
}

function providerErrorResponse(text: string, originalMessages: UIMessage[]): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = "provider-error";
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
    },
    originalMessages,
  });
  return createUIMessageStreamResponse({ stream });
}
