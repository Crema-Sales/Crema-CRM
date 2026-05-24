import { createFileRoute } from "@tanstack/react-router";

// GET /api/v1/openapi — the complete OpenAPI 3.1 spec for the public Crema
// REST API. Hand-maintained: when you add or change an /api/v1/* route, update
// this document. It is rendered live by /api/v1/docs (Scalar) and consumed by
// the CLI in /cli. Keep paths, schemas, and auth notes in sync with reality.

const ErrorSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string", example: "unauthorized" },
        message: { type: "string", example: "Missing or invalid auth" },
      },
      required: ["code", "message"],
    },
  },
  required: ["error"],
} as const;

const CompanyRef = {
  type: "object",
  nullable: true,
  properties: {
    id: { type: "string" },
    name: { type: "string" },
  },
} as const;

const ContactSummary = {
  type: "object",
  properties: {
    id: { type: "string" },
    full_name: { type: "string", nullable: true },
    email: { type: "string", nullable: true },
    phone: { type: "string", nullable: true },
    title: { type: "string", nullable: true },
    relationship_stage: {
      type: "string",
      enum: ["lead", "contact", "deal", "customer"],
      description: "Where the contact sits in the relationship funnel.",
    },
    is_ideal_customer: { type: "boolean" },
    stage_entered_at: { type: "string", nullable: true },
    created_at: { type: "string" },
    company: CompanyRef,
  },
} as const;

const Action = {
  type: "object",
  description:
    "One entry in the prioritized action queue. `kind` discriminates the payload; `score` is the blended urgency rank (higher = do sooner).",
  properties: {
    kind: { type: "string", enum: ["ticket", "lead", "checkin"] },
    id: { type: "string" },
    contact_id: { type: "string", nullable: true },
    subject: { type: "string" },
    score: { type: "number" },
    verb: { type: "string", example: "Reply (SLA overdue)" },
    sla_due_at: { type: "string", nullable: true, description: "ticket kind only" },
    priority: { type: "string", description: "ticket kind only" },
    lead_score: { type: "number", description: "lead kind only" },
    days_since: { type: "integer", description: "checkin kind only — days since last activity" },
  },
  required: ["kind", "id", "subject", "score", "verb"],
} as const;

const Deal = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    stage: { type: "string" },
    value: { type: "number" },
    probability: { type: "number", nullable: true },
    company: CompanyRef,
    contact: {
      type: "object",
      nullable: true,
      properties: { id: { type: "string" }, full_name: { type: "string", nullable: true } },
    },
    owner_id: { type: "string", nullable: true },
    expected_close: { type: "string", nullable: true },
    closed_at: { type: "string", nullable: true },
    created_at: { type: "string" },
  },
} as const;

const Ticket = {
  type: "object",
  properties: {
    id: { type: "string" },
    subject: { type: "string" },
    description: { type: "string", nullable: true },
    status: { type: "string", enum: ["open", "pending", "resolved", "closed"] },
    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    sla_due_at: { type: "string", nullable: true },
    sla_overdue: { type: "boolean", description: "True when past SLA and not resolved/closed." },
    assigned_to: { type: "string", nullable: true },
    created_at: { type: "string" },
    contact: {
      type: "object",
      nullable: true,
      properties: {
        id: { type: "string" },
        full_name: { type: "string", nullable: true },
        email: { type: "string", nullable: true },
      },
    },
  },
} as const;

const okError = {
  "401": {
    description: "Missing or invalid credentials.",
    content: { "application/json": { schema: ErrorSchema } },
  },
} as const;

const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "Crema Sales API",
    version: "1.0.0",
    description:
      "The public REST API for cremasales.com. Every endpoint is scoped to the " +
      "calling user's purview — their role and current organization. Reps see " +
      "only their own records; admins and managers see the whole org.\n\n" +
      "**Authentication.** Send `Authorization: Bearer <token>` on every request. " +
      "The token is either an API key (`crema_sk_…`, minted on the CLI / API " +
      "settings page) or a session JWT. API keys are the right choice for the " +
      "Crema CLI and for AI agents acting on a user's behalf.\n\n" +
      "**Errors.** Non-2xx responses carry `{ error: { code, message } }`.",
  },
  servers: [
    { url: "https://cremasales.com", description: "Production" },
    { url: "http://localhost:5173", description: "Local dev" },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "An API key (crema_sk_…) or a session JWT.",
      },
    },
    schemas: {
      Error: ErrorSchema,
      ContactSummary,
      Action,
      Deal,
      Ticket,
    },
  },
  security: [{ BearerAuth: [] }],
  tags: [
    { name: "identity", description: "Who the caller is." },
    { name: "work", description: "The prioritized things to do." },
    { name: "contacts", description: "People in the CRM." },
    { name: "deals", description: "Open and closed deals." },
    { name: "tickets", description: "Support tickets with SLA tracking." },
    {
      name: "coach",
      description:
        "Sales Coach — the same persona + tool pipeline the in-app chat " +
        "uses, exposed synchronously so CLIs and other bearer-authed " +
        "agents can talk to it without a WebSocket.",
    },
  ],
  paths: {
    "/api/v1/me": {
      get: {
        tags: ["identity"],
        operationId: "getMe",
        summary: "Calling user's identity + organization",
        description: "Resolves the bearer token to its owner and current org.",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    profile: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        email: { type: "string" },
                        full_name: { type: "string", nullable: true },
                        avatar_url: { type: "string", nullable: true },
                        title: { type: "string", nullable: true },
                        sales_methodology: { type: "string", nullable: true },
                      },
                    },
                    roles: { type: "array", items: { type: "string" } },
                    userId: { type: "string" },
                    currentOrgId: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
          ...okError,
          "404": {
            description: "Authenticated, but the user row is missing.",
            content: { "application/json": { schema: ErrorSchema } },
          },
        },
      },
    },
    "/api/v1/actions": {
      get: {
        tags: ["work"],
        operationId: "listActions",
        summary: "Prioritized action queue",
        description:
          "Up to 20 ranked next actions, blending ticket urgency (SLA), lead " +
          "score, and customer check-in staleness. Same logic as the Today page.",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/Action" } },
                  },
                },
              },
            },
          },
          ...okError,
        },
      },
    },
    "/api/v1/contacts": {
      get: {
        tags: ["contacts"],
        operationId: "listContacts",
        summary: "List contacts",
        description:
          "The caller's contacts (newest first, max 200). Admins and managers " +
          "see the whole org; reps see only contacts they own.",
        parameters: [
          {
            name: "assigned_to_me",
            in: "query",
            required: false,
            schema: { type: "boolean" },
            description: "Force owner = me even for admins/managers.",
          },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ContactSummary" },
                    },
                  },
                },
              },
            },
          },
          ...okError,
        },
      },
    },
    "/api/v1/contacts/{id}": {
      get: {
        tags: ["contacts"],
        operationId: "getContact",
        summary: "Contact detail",
        description:
          "Full contact record plus timeline (activities), purchases, deals, " +
          "and computed lifetime value.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    contact: { type: "object", description: "Contact row + nested company." },
                    activities: { type: "array", items: { type: "object" } },
                    purchases: { type: "array", items: { type: "object" } },
                    deals: { type: "array", items: { type: "object" } },
                    ltv: { type: "number", description: "Sum of purchase amounts." },
                  },
                },
              },
            },
          },
          ...okError,
          "403": {
            description: "Contact belongs to a different organization.",
            content: { "application/json": { schema: ErrorSchema } },
          },
          "404": {
            description: "Contact not found.",
            content: { "application/json": { schema: ErrorSchema } },
          },
        },
      },
    },
    "/api/v1/contacts/{id}/notes": {
      post: {
        tags: ["contacts"],
        operationId: "createContactNote",
        summary: "Append a note to a contact's timeline",
        description: "Creates a `note` activity owned by the caller.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["body"],
                properties: {
                  body: { type: "string", minLength: 1, maxLength: 5000 },
                  subject: {
                    type: "string",
                    maxLength: 200,
                    description: "Optional — defaults to the first line of the body.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    activity_id: { type: "string" },
                  },
                },
              },
            },
          },
          ...okError,
          "403": {
            description: "Contact belongs to a different organization.",
            content: { "application/json": { schema: ErrorSchema } },
          },
          "404": {
            description: "Contact not found.",
            content: { "application/json": { schema: ErrorSchema } },
          },
          "422": {
            description: "Request body failed validation.",
            content: { "application/json": { schema: ErrorSchema } },
          },
        },
      },
    },
    "/api/v1/deals": {
      get: {
        tags: ["deals"],
        operationId: "listDeals",
        summary: "List deals",
        description:
          "Deals in the caller's org (max 200). Reps see only deals they own; " +
          "admins and managers see all.",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/Deal" } },
                  },
                },
              },
            },
          },
          ...okError,
        },
      },
    },
    "/api/v1/coach/chat": {
      post: {
        tags: ["coach"],
        operationId: "coachChat",
        summary: "Ask the Sales Coach (one synchronous turn)",
        description:
          "Runs one full coach turn — system prompt, persona overlay, " +
          "and the same tool catalog the UI's WebSocket chat uses — then " +
          "returns the final text plus a transcript of every tool the " +
          "coach called. Up to 10 tool-call steps per request, capped to " +
          "match the in-app chat. The call does NOT append to the rep's " +
          "in-app chat history; pass prior turns in `history` for follow-ups.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["prompt"],
                properties: {
                  prompt: {
                    type: "string",
                    minLength: 1,
                    maxLength: 8000,
                    description: "The rep's question or instruction.",
                  },
                  history: {
                    type: "array",
                    maxItems: 40,
                    description:
                      "Optional prior turns for a multi-turn conversation. " +
                      "Each entry is one message with a role and content.",
                    items: {
                      type: "object",
                      required: ["role", "content"],
                      properties: {
                        role: { type: "string", enum: ["user", "assistant", "system"] },
                        content: { type: "string", minLength: 1, maxLength: 8000 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Coach reply",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    text: {
                      type: "string",
                      description: "The coach's final assistant text.",
                    },
                    steps: {
                      type: "integer",
                      description: "Number of tool-call steps the coach took.",
                    },
                    tool_calls: {
                      type: "array",
                      description: "Ordered transcript of tool invocations.",
                      items: {
                        type: "object",
                        properties: {
                          toolName: { type: "string" },
                          input: {},
                          output: {},
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          ...okError,
          "422": {
            description: "Request body failed validation.",
            content: { "application/json": { schema: ErrorSchema } },
          },
          "502": {
            description: "The backend agent Worker was unreachable or errored.",
            content: { "application/json": { schema: ErrorSchema } },
          },
        },
      },
    },
    "/api/v1/tickets": {
      get: {
        tags: ["tickets"],
        operationId: "listTickets",
        summary: "List tickets",
        description:
          "Support tickets with derived SLA flags (max 200). Reps see only " +
          "tickets assigned to them; admins and managers see all.",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/Ticket" } },
                  },
                },
              },
            },
          },
          ...okError,
        },
      },
    },
  },
} as const;

export const Route = createFileRoute("/api/v1/openapi")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(SPEC, null, 2), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }),
    },
  },
});
