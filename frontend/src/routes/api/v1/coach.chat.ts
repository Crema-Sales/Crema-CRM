import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getDB, getEnv } from "@/db/env.server";
import { signJwt } from "@/auth/crypto";
import { errorResponse, jsonResponse, optionsResponse, requireRestAuth } from "@/lib/api-v1";

// POST /api/v1/coach/chat — synchronous (non-streaming) coach turn for the
// public REST surface. Lets the CLI, MCP tools, and any other bearer-authed
// caller talk to the same persona + tool pipeline the UI's WebSocket chat
// uses, without speaking WS. We mint a short-lived rep JWT carrying the
// caller's persona + system-prompt overlays and proxy to the backend agent
// Worker's `POST /v1/coach/chat` route.

const DEFAULT_COACH_AGENT_URL = "https://ctrl-alt-elite-agent.smashlabs.workers.dev";
const PROXY_TTL_SEC = 120;

const HistoryMessage = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(8000),
});

const Payload = z.object({
  prompt: z.string().min(1).max(8000),
  history: z.array(HistoryMessage).max(40).optional(),
});

export const Route = createFileRoute("/api/v1/coach/chat")({
  server: {
    handlers: {
      OPTIONS: async () => optionsResponse(),
      POST: async ({ request }) => {
        const r = await requireRestAuth(request);
        if (r.error) return r.error;
        const { ctx } = r;

        let parsed: z.infer<typeof Payload>;
        try {
          parsed = Payload.parse(await request.json());
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          return errorResponse(422, "validation_failed", message);
        }

        // Pull the persona + overlay prompts the agent expects on every turn.
        // The same three values get baked into the cookie-JWT on login, so
        // this read mirrors what a UI session would carry.
        const db = getDB();
        const user = await db
          .prepare("SELECT coach_persona_slug, system_prompt FROM users WHERE id = ?")
          .bind(ctx.userId)
          .first<{ coach_persona_slug: string | null; system_prompt: string | null }>();
        const orgPrompt = ctx.currentOrgId
          ? (
              await db
                .prepare("SELECT system_prompt FROM organizations WHERE id = ?")
                .bind(ctx.currentOrgId)
                .first<{ system_prompt: string | null }>()
            )?.system_prompt ?? null
          : null;

        const env = getEnv();
        const repJwt = await signJwt(
          {
            sub: ctx.userId,
            email: ctx.email ?? "",
            role: ctx.role,
            current_org_id: ctx.currentOrgId ?? undefined,
            coach_persona_slug: user?.coach_persona_slug ?? null,
            org_system_prompt: orgPrompt,
            user_system_prompt: user?.system_prompt ?? null,
          },
          env.JWT_SECRET,
          PROXY_TTL_SEC,
        );

        const agentUrl = (env.COACH_AGENT_URL ?? DEFAULT_COACH_AGENT_URL).replace(/\/+$/, "");
        let upstream: Response;
        try {
          upstream = await fetch(`${agentUrl}/v1/coach/chat`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${repJwt}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ prompt: parsed.prompt, history: parsed.history ?? [] }),
          });
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          return errorResponse(502, "agent_unreachable", message);
        }

        const text = await upstream.text();
        let body: unknown = text;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          // upstream returned non-JSON — surface verbatim under a wrapper so
          // the caller still gets a structured response.
          return jsonResponse(
            { error: { code: "agent_bad_response", message: text.slice(0, 500) } },
            { status: 502 },
          );
        }
        return jsonResponse(body, { status: upstream.status });
      },
    },
  },
});
