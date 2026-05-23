import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { RepAgent } from "./agent";
import { RepExtension } from "./rep-extension";
import { RepMcp } from "./mcp";
import { CustomerStream } from "./customer-stream";
import { requireRep, signRepJwt, verifyRepJwt, type RepIdentity } from "./auth";
import { isValidRepIdForRoute } from "./rep-id";
import { scheduled, runDailySummaryFanOut } from "./cron";
import { errorBody } from "./routes/_util";
import { meRoutes } from "./routes/me";
import { customerRoutes } from "./routes/customers";
import { leadRoutes } from "./routes/leads";
import { ticketRoutes } from "./routes/tickets";
import { actionRoutes } from "./routes/actions";
import { researchRoutes } from "./routes/research";
import { ingestRoutes } from "./routes/ingest";

export interface Env {
  JWT_SIGNING_KEY: string;
  ENVIRONMENT: string;
  AGENT_LLM_PROVIDER: string;
  AI_GATEWAY_ID: string;
  AI_GATEWAY_ACCOUNT_ID: string;
  WORKERS_AI_MODEL: string;
  OPENROUTER_API_KEY?: string;
  TAVILY_API_KEY?: string;
  INTERNAL_API_BASE?: string;
  /** Comma-separated origin allowlist for CORS + WS Origin checks. */
  UI_ORIGIN?: string;
  AI: Ai;
  DB: D1Database;
  IDENTITY: KVNamespace;
  /** JSON-encoded { source: hex_key } map used by /v1/ingest HMAC verify. */
  INGEST_HMAC_KEYS?: string;
  AGENT: DurableObjectNamespace<RepAgent>;
  REP_EXT: DurableObjectNamespace<RepExtension>;
  MCP_AGENT: DurableObjectNamespace<RepMcp>;
  CUSTOMER_STREAM: DurableObjectNamespace<CustomerStream>;
  SELF?: Fetcher;
}

type AppEnv = { Bindings: Env; Variables: { rep: RepIdentity } };

const app = new OpenAPIHono<AppEnv>();

const DEFAULT_UI_ORIGINS = [
  "https://ctv-crm.smashlabs.workers.dev",
  "http://localhost:5173",
];

function uiOriginAllowlist(env: Env): string[] {
  const raw = env.UI_ORIGIN ?? DEFAULT_UI_ORIGINS.join(",");
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isOriginAllowed(env: Env, origin: string | null): boolean {
  if (!origin) return false;
  return uiOriginAllowlist(env).includes(origin);
}

app.use("*", (c, next) =>
  cors({
    origin: (incoming) => (isOriginAllowed(c.env, incoming) ? incoming : null),
    credentials: false,
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type", "x-request-id"],
    exposeHeaders: ["x-request-id"],
    maxAge: 600,
  })(c, next),
);

const HealthResponse = z
  .object({
    ok: z.literal(true),
    version: z.string(),
    phase: z.string(),
  })
  .openapi("HealthResponse");

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["meta"],
  summary: "Liveness probe",
  responses: {
    200: {
      description: "Worker is reachable",
      content: { "application/json": { schema: HealthResponse } },
    },
  },
});

app.openapi(healthRoute, (c) =>
  c.json({ ok: true as const, version: "0.1.0", phase: "agentic-foundation" }, 200),
);

app.post("/dev/token", async (c) => {
  if (c.env.ENVIRONMENT !== "dev") return c.json({ error: "not_found" }, 404);
  if (!c.env.JWT_SIGNING_KEY) return c.json({ error: "server_misconfigured" }, 500);

  const body = await c.req.json<{ repId?: string; email?: string }>().catch(() => null);
  if (!isValidRepIdForRoute(body?.repId, c.env.ENVIRONMENT)) {
    return c.json({ error: "bad_request" }, 400);
  }
  const repId = body!.repId!;
  const email = body!.email ?? `${repId}@cremasales.example`;
  const ttl = 8 * 60 * 60;
  const token = await signRepJwt(c.env, repId, email);
  console.log(
    `[dev/token] mint repId=${repId} ttlSeconds=${ttl} ts=${new Date().toISOString()}`,
  );
  return c.json({ token, expiresIn: ttl });
});

// WS upgrade auth is handled inline below so terminal failures can be surfaced
// as application-level WebSocket close codes (4400/4401) the extension's
// onclose handler can distinguish from transient drops (1006/1011). HTTP-only
// routes (`/status`, `/act`) keep the standard `requireRep` JSON 401 path.
app.use("/agents/:repId/status", async (c, next) => {
  const rep = await requireRep(c);
  const repId = c.req.param("repId");
  if (repId && rep.repId !== repId) {
    throw new HTTPException(403, {
      res: Response.json(errorBody("forbidden", "rep id mismatch"), { status: 403 }),
    });
  }
  await next();
});
app.use("/agents/:repId/act", async (c, next) => {
  const rep = await requireRep(c);
  const repId = c.req.param("repId");
  if (repId && rep.repId !== repId) {
    throw new HTTPException(403, {
      res: Response.json(errorBody("forbidden", "rep id mismatch"), { status: 403 }),
    });
  }
  await next();
});

app.get("/agents/:repId/ws", async (c) => {
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    return c.json({ error: "upgrade_required" }, 426);
  }
  const repId = c.req.param("repId");
  if (!isValidRepIdForRoute(repId, c.env.ENVIRONMENT)) {
    return acceptAndClose(4400, "invalid_rep_id");
  }
  if (!c.env.JWT_SIGNING_KEY) {
    return acceptAndClose(4401, "unauthorized");
  }
  const token = c.req.query("token");
  if (!token) {
    return acceptAndClose(4401, "unauthorized");
  }
  // Dev-only fallback: `?token=dev` synthesizes the `rep_demo` rep, mirroring
  // the HTTP shortcut in `auth.ts`. Strict-mode token verification otherwise.
  if (!(c.env.ENVIRONMENT === "dev" && token === "dev" && repId === "rep_demo")) {
    const rep = await verifyRepJwt(c.env, token);
    if (!rep || rep.repId !== repId) {
      return acceptAndClose(4401, "unauthorized");
    }
  }

  const id = c.env.REP_EXT.idFromName(repId);
  const stub = c.env.REP_EXT.get(id);
  return stub.fetch(c.req.raw);
});

app.get("/agents/:repId/status", (c) => {
  const repId = c.req.param("repId");
  const id = c.env.REP_EXT.idFromName(repId);
  const stub = c.env.REP_EXT.get(id);
  return stub.fetch(c.req.raw);
});

app.post("/agents/:repId/act", (c) => {
  const repId = c.req.param("repId");
  const id = c.env.REP_EXT.idFromName(repId);
  const stub = c.env.REP_EXT.get(id);
  return stub.fetch(c.req.raw);
});

// Public /v1 routes (HMAC or no auth). Mount before the JWT gate.
app.route("/", ingestRoutes);

// All /v1/* routes require a valid rep JWT (or the dev fallback). Public routes
// (`/health`, `/openapi.json`, `/docs`, `/v1/ingest`, `/v1/pixel`) bypass it.
app.use("/v1/*", async (c, next) => {
  const p = c.req.path;
  if (p === "/v1/ingest" || p === "/v1/pixel") return next();
  c.set("rep", await requireRep(c));
  await next();
});

app.route("/", meRoutes);
app.route("/", customerRoutes);
app.route("/", leadRoutes);
app.route("/", ticketRoutes);
app.route("/", actionRoutes);
app.route("/", researchRoutes);

app.doc31("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Crema Sales Agent API",
    version: "0.1.0",
    description:
      "Agentic backend for Crema Sales — per-rep RepAgent Durable Object plus the shared CRM API contract.",
  },
});

app.get(
  "/docs",
  Scalar({
    url: "/openapi.json",
    theme: "default",
    pageTitle: "Crema Sales Agent API",
  }),
);

app.notFound((c) =>
  c.json({ error: { code: "not_found", message: "route not registered" } }, 404),
);

// Accept the WS upgrade, then immediately close with a terminal application
// code so the extension's onclose handler can distinguish auth failure (4401)
// or malformed repId (4400) from transient drops (1006/1011) and stop the
// reconnect backoff. The 4403 code is reserved for server-initiated ban.
function acceptAndClose(code: number, reason: string): Response {
  const pair = new WebSocketPair();
  const server = pair[1];
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: pair[0] });
}

export { CustomerStream, RepAgent, RepExtension, RepMcp };

function unauthorizedResponse(message: string): Response {
  return Response.json(errorBody("unauthorized", message), { status: 401 });
}

/**
 * Authenticate an MCP request. Streamable-HTTP supports custom headers, so
 * we read `Authorization: Bearer <jwt>`. SSE clients can't set arbitrary
 * headers on `EventSource`, so we also accept `?token=<jwt>` on `/v1/mcp/sse`.
 * Dev-only `dev` shortcut mirrors the WS path so the inspector can use it.
 */
async function authenticateMcp(
  env: Env,
  request: Request,
): Promise<{ jwt: string; repId: string; email: string } | null> {
  const url = new URL(request.url);
  const authHeader = request.headers.get("Authorization") ?? request.headers.get("authorization");
  let token: string | null = null;
  if (authHeader) {
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (m) token = m[1].trim();
  }
  if (!token && url.pathname.startsWith("/v1/mcp/sse")) {
    token = url.searchParams.get("token");
  }
  if (!token) return null;

  if (env.ENVIRONMENT === "dev" && token === "dev") {
    return { jwt: token, repId: "rep_demo", email: "demo@cremasales.example" };
  }
  const rep = await verifyRepJwt(env, token);
  if (!rep) return null;
  return { jwt: token, repId: rep.repId, email: rep.email };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      if (url.pathname.startsWith("/v1/agent")) {
        // Reject cross-origin WS upgrades from non-allowlisted origins. The
        // Hono cors() middleware doesn't apply here because the WS branch
        // never reaches the Hono app. Same-origin and curl (no Origin header)
        // are allowed; browsers always send Origin on WS upgrades.
        const origin = request.headers.get("Origin");
        if (origin && !isOriginAllowed(env, origin)) {
          return new Response("origin not allowed", { status: 403 });
        }

        const token = url.searchParams.get("token");
        if (!token) {
          return unauthorizedResponse("missing token query parameter");
        }

        let repId: string;
        // Dev-only fallback: `?token=dev` synthesizes a fake rep. Gated to ENVIRONMENT=dev.
        if (env.ENVIRONMENT === "dev" && token === "dev") {
          repId = "rep_demo";
        } else {
          const rep = await verifyRepJwt(env, token);
          if (!rep) {
            return unauthorizedResponse("missing or invalid JWT");
          }
          repId = rep.repId;
        }

        const headers = new Headers(request.headers);
        headers.set("x-rep-jwt", token);
        const forwarded = new Request(request, { headers });

        const id = env.AGENT.idFromName(repId);
        const stub = env.AGENT.get(id);
        return stub.fetch(forwarded);
      }
    }

    // MCP routes. SSE is checked first because `/v1/mcp/sse` is a more
    // specific prefix than `/v1/mcp`.
    if (url.pathname.startsWith("/v1/mcp/sse")) {
      const auth = await authenticateMcp(env, request);
      if (!auth) return unauthorizedResponse("missing or invalid JWT for MCP SSE");
      (ctx as ExecutionContext & { props?: Record<string, unknown> }).props = {
        jwt: auth.jwt,
        repId: auth.repId,
      };
      return RepMcp.serveSSE("/v1/mcp/sse", { binding: "MCP_AGENT" }).fetch(
        request,
        env,
        ctx,
      );
    }
    if (url.pathname.startsWith("/v1/mcp")) {
      const auth = await authenticateMcp(env, request);
      if (!auth) return unauthorizedResponse("missing or invalid JWT for MCP");
      (ctx as ExecutionContext & { props?: Record<string, unknown> }).props = {
        jwt: auth.jwt,
        repId: auth.repId,
      };
      return RepMcp.serve("/v1/mcp", {
        binding: "MCP_AGENT",
        transport: "streamable-http",
      }).fetch(request, env, ctx);
    }

    // Dev-only manual cron trigger. Wrangler does NOT fire cron triggers in
    // local dev (per AGENTS-WORKERS.md), so this is the only way to exercise
    // the daily-summary fan-out without deploying.
    //
    // Gate is ENVIRONMENT === "dev" (set only in backend/.dev.vars). The prior
    // gate compared AGENT_LLM_PROVIDER to "production" — that value is the
    // model provider name ("openrouter"/"workers-ai"), never "production", so
    // the route was publicly reachable in production. Anyone could spam this
    // path and trigger unauthenticated LLM fan-outs against every active rep.
    if (url.pathname === "/__cron/daily" && env.ENVIRONMENT === "dev") {
      const result = await runDailySummaryFanOut(env);
      return Response.json({
        ok: true,
        ran: result.ran,
        succeeded: result.succeeded,
        failed: result.failed,
      });
    }

    return app.fetch(request, env, ctx);
  },
  scheduled,
} satisfies ExportedHandler<Env>;
