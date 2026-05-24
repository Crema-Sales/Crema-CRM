#!/usr/bin/env bun
/**
 * Crema CLI — a dependency-free command-line client for the Crema Sales API.
 *
 * Every public REST endpoint (https://cremasales.com/api/v1/*) is exposed as a
 * subcommand. Authentication is a single API key minted in the Crema web app
 * under "CLI / API". The `--json` flag turns the CLI into a clean tool surface
 * for autonomous AI agents; `raw` is the escape hatch for anything not yet
 * wrapped in a named command.
 *
 * Self-discovery for agents (nominal token spend):
 *   crema -h                  greppable catalog — `cmd:` prefixes every command
 *   crema <command> -h        per-command detail (usage, args, flags, returns)
 *   crema help --json         the whole catalog as machine-readable JSON
 *
 * Runs on Bun (`./crema.ts`) or Node 18+ (`npx tsx crema.ts`). No npm
 * dependencies — only the standard library and the global `fetch`.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { createInterface } from "node:readline";

const CONFIG_DIR = join(homedir(), ".crema");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const DEFAULT_BASE = "https://cremasales.com";
const VERSION = "1.0.0";

interface Config {
  apiKey?: string;
  apiBase?: string;
}

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

// ─────────────────────────────── arg parsing ───────────────────────────────

// Short flags map onto their long names so `-h` behaves exactly like `--help`.
const SHORT_ALIAS: Record<string, string> = {
  h: "help",
  v: "version",
  j: "json",
};

// `--flag value`, `--flag` (boolean), `-h` (short boolean). Anything else is a
// positional. Short flags are always boolean — long flags take the next token
// as a value unless it is itself a flag.
function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[name] = next;
        i++;
      } else {
        flags[name] = true;
      }
    } else if (arg.startsWith("-") && arg.length > 1 && !/^-\d/.test(arg)) {
      const name = arg.slice(1);
      flags[SHORT_ALIAS[name] ?? name] = true;
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

// ───────────────────────────────── config ──────────────────────────────────

function loadFileConfig(): Config {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config;
  } catch {
    return {};
  }
}

// Precedence: explicit flag > environment variable > saved config file.
function resolveConfig(
  flags: Record<string, string | boolean>,
): Required<Config> {
  const file = loadFileConfig();
  const apiKey =
    (typeof flags.key === "string" ? flags.key : undefined) ??
    process.env.CREMA_API_KEY ??
    file.apiKey ??
    "";
  const apiBase = (
    (typeof flags.base === "string" ? flags.base : undefined) ??
    process.env.CREMA_API_BASE ??
    file.apiBase ??
    DEFAULT_BASE
  ).replace(/\/+$/, "");
  return { apiKey, apiBase };
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function configure(): Promise<void> {
  const existing = loadFileConfig();
  console.log(
    "Configure the Crema CLI. Press Enter to keep the current value.\n",
  );
  const keyPrompt = existing.apiKey
    ? `API key [${mask(existing.apiKey)}]: `
    : "API key (crema_sk_…): ";
  const key = (await ask(keyPrompt)) || existing.apiKey || "";
  const base =
    (await ask(`API base URL [${existing.apiBase ?? DEFAULT_BASE}]: `)) ||
    existing.apiBase ||
    DEFAULT_BASE;

  if (!key) {
    fail("No API key provided. Mint one in the Crema web app under CLI / API.");
  }
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(
    CONFIG_PATH,
    JSON.stringify({ apiKey: key, apiBase: base }, null, 2),
  );
  try {
    chmodSync(CONFIG_PATH, 0o600);
  } catch {
    /* best-effort — Windows and some filesystems don't support chmod */
  }
  console.log(`\nSaved to ${CONFIG_PATH}`);
}

function mask(key: string): string {
  return key.length > 14 ? `${key.slice(0, 12)}…${key.slice(-4)}` : "set";
}

// ──────────────────────────────── http ─────────────────────────────────────

interface ApiResult {
  ok: boolean;
  status: number;
  body: unknown;
}

async function apiRequest(
  cfg: Required<Config>,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult> {
  if (!cfg.apiKey) {
    fail(
      "No API key. Run `crema configure`, set CREMA_API_KEY, or pass --key.",
    );
  }
  const url = path.startsWith("http") ? path : `${cfg.apiBase}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    fail(`Network error calling ${method} ${url}: ${(e as Error).message}`);
  }
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep raw text */
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

// ─────────────────────────────── output ────────────────────────────────────

let jsonMode = false;

function emit(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function fail(message: string): never {
  if (jsonMode) {
    console.log(JSON.stringify({ error: message }));
  } else {
    console.error(`✗ ${message}`);
  }
  process.exit(1);
}

// Render an API result. In --json mode the raw body is printed untouched so
// agents get a stable contract; otherwise `render` shapes a readable view.
function show(result: ApiResult, render: (body: any) => void): void {
  if (!result.ok) {
    const body = result.body as { error?: { message?: string } };
    fail(
      `HTTP ${result.status}: ${body?.error?.message ?? JSON.stringify(result.body)}`,
    );
  }
  if (jsonMode) {
    emit(result.body);
    return;
  }
  render(result.body);
}

function row(label: string, value: unknown): void {
  console.log(`  ${label.padEnd(16)} ${value ?? "—"}`);
}

// ─────────────────────────────── commands ──────────────────────────────────

async function cmdMe(cfg: Required<Config>): Promise<void> {
  const res = await apiRequest(cfg, "GET", "/api/v1/me");
  show(res, (b) => {
    console.log("You");
    row("name", b.profile?.full_name);
    row("email", b.profile?.email);
    row("title", b.profile?.title);
    row("roles", (b.roles ?? []).join(", "));
    row("user id", b.userId);
    row("org id", b.currentOrgId);
  });
}

async function cmdActions(cfg: Required<Config>): Promise<void> {
  const res = await apiRequest(cfg, "GET", "/api/v1/actions");
  show(res, (b) => {
    const items = b.items ?? [];
    console.log(`Action queue — ${items.length} item(s)`);
    for (const a of items) {
      console.log(
        `  [${String(a.score).padStart(3)}] ${a.kind.padEnd(8)} ${a.verb} — ${a.subject}`,
      );
    }
  });
}

async function cmdContacts(
  cfg: Required<Config>,
  args: ParsedArgs,
): Promise<void> {
  const q = args.flags.mine ? "?assigned_to_me=true" : "";
  const res = await apiRequest(cfg, "GET", `/api/v1/contacts${q}`);
  show(res, (b) => {
    const items = b.items ?? [];
    console.log(`Contacts — ${items.length}`);
    for (const c of items) {
      const co = c.company ? ` @ ${c.company.name}` : "";
      console.log(
        `  ${c.id}  ${(c.full_name ?? "—").padEnd(24)} ${c.relationship_stage}${co}`,
      );
    }
  });
}

async function cmdContact(
  cfg: Required<Config>,
  args: ParsedArgs,
): Promise<void> {
  const id = args.positionals[1];
  if (!id) fail("Usage: crema contact <id>  (see `crema contact -h`)");
  const res = await apiRequest(
    cfg,
    "GET",
    `/api/v1/contacts/${encodeURIComponent(id)}`,
  );
  show(res, (b) => {
    const c = b.contact ?? {};
    console.log(`Contact ${c.id}`);
    row("name", c.full_name);
    row("email", c.email);
    row("stage", c.relationship_stage);
    row("company", c.company?.name);
    row("lifetime value", b.ltv);
    row("activities", (b.activities ?? []).length);
    row("deals", (b.deals ?? []).length);
  });
}

async function cmdNote(cfg: Required<Config>, args: ParsedArgs): Promise<void> {
  const id = args.positionals[1];
  const body = args.positionals.slice(2).join(" ");
  if (!id || !body) {
    fail(
      'Usage: crema note <contactId> "<body>" [--subject "<text>"]  (see `crema note -h`)',
    );
  }
  const payload: { body: string; subject?: string } = { body };
  if (typeof args.flags.subject === "string")
    payload.subject = args.flags.subject;
  const res = await apiRequest(
    cfg,
    "POST",
    `/api/v1/contacts/${encodeURIComponent(id)}/notes`,
    payload,
  );
  show(res, (b) => console.log(`✓ Note added (activity ${b.activity_id})`));
}

async function cmdDeals(cfg: Required<Config>): Promise<void> {
  const res = await apiRequest(cfg, "GET", "/api/v1/deals");
  show(res, (b) => {
    const items = b.items ?? [];
    console.log(`Deals — ${items.length}`);
    for (const d of items) {
      console.log(
        `  ${d.id}  ${(d.name ?? "—").padEnd(28)} ${d.stage.padEnd(12)} $${d.value ?? 0}`,
      );
    }
  });
}

async function cmdTickets(cfg: Required<Config>): Promise<void> {
  const res = await apiRequest(cfg, "GET", "/api/v1/tickets");
  show(res, (b) => {
    const items = b.items ?? [];
    console.log(`Tickets — ${items.length}`);
    for (const t of items) {
      const flag = t.sla_overdue ? " ⚠ SLA" : "";
      console.log(
        `  ${t.id}  [${t.priority}/${t.status}] ${(t.subject ?? "—").slice(0, 44)}${flag}`,
      );
    }
  });
}

async function cmdCoach(cfg: Required<Config>, args: ParsedArgs): Promise<void> {
  const prompt = args.positionals.slice(1).join(" ").trim();
  if (!prompt) {
    fail(
      'Usage: crema coach "<prompt>" [--history <path>]  (see `crema coach -h`)',
    );
  }
  let history: { role: string; content: string }[] = [];
  if (typeof args.flags.history === "string") {
    let raw: string;
    try {
      raw = readFileSync(args.flags.history, "utf8");
    } catch (e) {
      fail(`--history: cannot read ${args.flags.history}: ${(e as Error).message}`);
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed))
        fail("--history: file must contain a JSON array of { role, content } entries");
      history = parsed;
    } catch (e) {
      fail(`--history: invalid JSON: ${(e as Error).message}`);
    }
  }
  const res = await apiRequest(cfg, "POST", "/api/v1/coach/chat", {
    prompt,
    history,
  });
  show(res, (b) => {
    const text = typeof b.text === "string" ? b.text : "";
    process.stdout.write(text);
    if (!text.endsWith("\n")) process.stdout.write("\n");
    const calls = Array.isArray(b.tool_calls) ? b.tool_calls : [];
    if (calls.length > 0) {
      console.log(`\n— ${calls.length} tool call(s) in ${b.steps ?? 0} step(s):`);
      for (const c of calls) console.log(`  • ${c.toolName}`);
    }
  });
}

async function cmdRaw(cfg: Required<Config>, args: ParsedArgs): Promise<void> {
  const method = (args.positionals[1] ?? "GET").toUpperCase();
  const path = args.positionals[2];
  if (!path)
    fail(
      "Usage: crema raw <METHOD> <path> [--data '<json>']  (see `crema raw -h`)",
    );
  let body: unknown;
  if (typeof args.flags.data === "string") {
    try {
      body = JSON.parse(args.flags.data);
    } catch {
      fail("--data must be valid JSON");
    }
  }
  const res = await apiRequest(cfg, method, path, body);
  if (jsonMode) {
    emit(res.body);
  } else {
    console.log(`HTTP ${res.status}`);
    emit(res.body);
  }
  if (!res.ok) process.exit(1);
}

// Hits every GET endpoint and reports reachability — a one-shot health check
// and a quick way for an agent to confirm its key works end to end.
async function cmdSmoke(cfg: Required<Config>): Promise<void> {
  const checks = [
    ["GET", "/api/v1/me"],
    ["GET", "/api/v1/actions"],
    ["GET", "/api/v1/contacts"],
    ["GET", "/api/v1/deals"],
    ["GET", "/api/v1/tickets"],
  ] as const;
  const results: { endpoint: string; status: number; ok: boolean }[] = [];
  for (const [method, path] of checks) {
    const res = await apiRequest(cfg, method, path);
    results.push({
      endpoint: `${method} ${path}`,
      status: res.status,
      ok: res.ok,
    });
  }
  const passed = results.filter((r) => r.ok).length;
  if (jsonMode) {
    emit({ passed, total: results.length, results });
  } else {
    console.log(
      `Smoke test against ${cfg.apiBase} — ${passed}/${results.length} passed`,
    );
    for (const r of results) {
      console.log(`  ${r.ok ? "✓" : "✗"} ${r.endpoint.padEnd(28)} ${r.status}`);
    }
  }
  if (passed !== results.length) process.exit(1);
}

// ─────────────────────────── command catalog ───────────────────────────────

interface CommandDoc {
  /** Subcommand name. */
  name: string;
  /** One-line invocation form. */
  usage: string;
  /** What the command does. */
  description: string;
  /** Positional arguments, "none" when there are none. */
  args: string;
  /** Command-specific flags. */
  flags: { flag: string; desc: string }[];
  /** Underlying HTTP call(s), "—" for local-only commands. */
  method: string;
  /** Shape of the data the command produces. */
  returns: string;
  /** A runnable example. */
  example: string;
  /** Handler — absent for help/version which `main` handles directly. */
  run?: (cfg: Required<Config>, args: ParsedArgs) => Promise<void>;
}

// The single source of truth for the command surface. Drives dispatch, the
// full `-h` catalog, per-command help, and the `help --json` machine catalog —
// so an agent can discover every capability without reading this source file.
const COMMANDS: CommandDoc[] = [
  {
    name: "configure",
    usage: "crema configure",
    description:
      "Interactively save an API key + base URL to ~/.crema/config.json.",
    args: "none",
    flags: [],
    method: "—",
    returns: "writes ~/.crema/config.json (chmod 600)",
    example: "crema configure",
    run: (_cfg) => configure(),
  },
  {
    name: "me",
    usage: "crema me",
    description: "Show the calling user's identity and current organization.",
    args: "none",
    flags: [],
    method: "GET /api/v1/me",
    returns:
      "{ profile{id,email,full_name,avatar_url,title,sales_methodology}, roles[], userId, currentOrgId }",
    example: "crema me --json",
    run: cmdMe,
  },
  {
    name: "actions",
    usage: "crema actions",
    description:
      "List the prioritized action queue — tickets, leads, and customer check-ins ranked by urgency.",
    args: "none",
    flags: [],
    method: "GET /api/v1/actions",
    returns:
      "{ items[]{ kind:ticket|lead|checkin, id, subject, score, verb, contact_id } }",
    example: "crema actions --json",
    run: cmdActions,
  },
  {
    name: "contacts",
    usage: "crema contacts [--mine]",
    description:
      "List contacts. Reps see their own; admins/managers see the whole org unless --mine is set.",
    args: "none",
    flags: [{ flag: "--mine", desc: "restrict to contacts you own" }],
    method: "GET /api/v1/contacts",
    returns:
      "{ items[]{ id, full_name, email, phone, title, relationship_stage, is_ideal_customer, company } }",
    example: "crema contacts --mine --json",
    run: cmdContacts,
  },
  {
    name: "contact",
    usage: "crema contact <id>",
    description:
      "Show one contact with its timeline, purchases, deals, and lifetime value.",
    args: "<id>  (required) — the contact id, e.g. c_8f3a1b20",
    flags: [],
    method: "GET /api/v1/contacts/{id}",
    returns: "{ contact{…}, activities[], purchases[], deals[], ltv }",
    example: "crema contact c_8f3a1b20 --json",
    run: cmdContact,
  },
  {
    name: "note",
    usage: 'crema note <contactId> "<body>" [--subject "<text>"]',
    description: "Append a note activity to a contact's timeline.",
    args: "<contactId> (required), <body> (required) — remaining words form the note body",
    flags: [
      {
        flag: "--subject <text>",
        desc: "optional note title (defaults to first line of body)",
      },
    ],
    method: "POST /api/v1/contacts/{id}/notes",
    returns: "{ ok, activity_id }",
    example: 'crema note c_8f3a1b20 "Left a voicemail" --subject "Follow-up"',
    run: cmdNote,
  },
  {
    name: "deals",
    usage: "crema deals",
    description:
      "List deals. Reps see their own; admins/managers see the whole org.",
    args: "none",
    flags: [],
    method: "GET /api/v1/deals",
    returns:
      "{ items[]{ id, name, stage, value, probability, company, contact, owner_id, expected_close, closed_at } }",
    example: "crema deals --json",
    run: cmdDeals,
  },
  {
    name: "tickets",
    usage: "crema tickets",
    description: "List support tickets with derived SLA flags.",
    args: "none",
    flags: [],
    method: "GET /api/v1/tickets",
    returns:
      "{ items[]{ id, subject, description, status, priority, sla_due_at, sla_overdue, assigned_to, contact } }",
    example: "crema tickets --json",
    run: cmdTickets,
  },
  {
    name: "coach",
    usage: 'crema coach "<prompt>" [--history <path>]',
    description:
      "Ask the Sales Coach one synchronous turn — same persona + tool catalog as the in-app chat. Prints the reply text; in --json mode emits the full { text, steps, tool_calls } envelope.",
    args: "<prompt>  (required) — remaining words form the prompt",
    flags: [
      {
        flag: "--history <path>",
        desc: "JSON file with a [{ role, content }, …] array for multi-turn follow-ups",
      },
    ],
    method: "POST /api/v1/coach/chat",
    returns:
      "{ text, steps, tool_calls[]{ toolName, input, output } }  (non-streaming)",
    example: 'crema coach "What should I work on this morning?"',
    run: cmdCoach,
  },
  {
    name: "smoke",
    usage: "crema smoke",
    description:
      "Call every GET endpoint and report reachability — confirms a key works end to end.",
    args: "none",
    flags: [],
    method: "GET /api/v1/{me,actions,contacts,deals,tickets}",
    returns:
      "{ passed, total, results[]{ endpoint, status, ok } }  (exit 1 if any failed)",
    example: "crema smoke --json",
    run: cmdSmoke,
  },
  {
    name: "raw",
    usage: "crema raw <METHOD> <path> [--data '<json>']",
    description:
      "Call any endpoint directly — the escape hatch for routes without a named command.",
    args: "<METHOD> (required, e.g. GET/POST), <path> (required, e.g. /api/v1/me)",
    flags: [{ flag: "--data <json>", desc: "request body as a JSON string" }],
    method: "any",
    returns: "the raw API response (exit 1 on non-2xx)",
    example: "crema raw GET /api/v1/contacts/c_8f3a1b20 --json",
    run: cmdRaw,
  },
  {
    name: "help",
    usage: "crema help [command] [--json]",
    description:
      "Show the command catalog, one command's detail, or the whole catalog as JSON.",
    args: "[command]  (optional) — show detail for just that command",
    flags: [
      { flag: "--json", desc: "emit the catalog as machine-readable JSON" },
    ],
    method: "—",
    returns: "this catalog",
    example: "crema help --json",
  },
  {
    name: "version",
    usage: "crema version",
    description: "Print the CLI version.",
    args: "none",
    flags: [],
    method: "—",
    returns: `"${VERSION}"`,
    example: "crema version",
  },
];

const GLOBAL_FLAGS = [
  { flag: "--key <crema_sk_…>", desc: "API key (overrides env + config file)" },
  { flag: "--base <url>", desc: `API base URL (default ${DEFAULT_BASE})` },
  {
    flag: "--json",
    desc: "emit raw JSON — use this when driving the CLI from an agent",
  },
  {
    flag: "-h, --help",
    desc: "show this catalog, or per-command detail after a command",
  },
  { flag: "-v, --version", desc: "print the CLI version" },
];

// ───────────────────────────────── help ────────────────────────────────────

// Per-command block. Every command starts with `cmd: <name>` and every detail
// line uses a fixed-width key, so an agent can enumerate with
// `crema -h | grep '^cmd:'` or drill in with `crema -h | grep -A8 'cmd: note'`.
function renderCommandDoc(c: CommandDoc): string {
  const lines: string[] = [`cmd: ${c.name}`];
  const detail = (k: string, v: string) =>
    lines.push(`    ${k.padEnd(8)} ${v}`);
  detail("usage", c.usage);
  detail("desc", c.description);
  detail("method", c.method);
  detail("args", c.args);
  if (c.flags.length === 0) {
    detail("flags", "none");
  } else {
    for (const f of c.flags) detail("flags", `${f.flag.padEnd(20)} ${f.desc}`);
  }
  detail("returns", c.returns);
  detail("example", c.example);
  return lines.join("\n");
}

function printHelp(): void {
  console.log(`crema CLI v${VERSION} — command-line client for the Crema Sales API
https://cremasales.com/api/v1 · spec: /api/v1/openapi · docs: /api/v1/docs

USAGE
  crema <command> [args] [flags]
  crema <command> -h            per-command detail
  crema help --json             machine-readable catalog for agents

COMMANDS`);
  for (const c of COMMANDS) {
    console.log("");
    console.log(
      renderCommandDoc(c)
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n"),
    );
  }
  console.log(`
GLOBAL FLAGS`);
  for (const f of GLOBAL_FLAGS) console.log(`  ${f.flag.padEnd(22)} ${f.desc}`);
  console.log(`
AUTH
  Precedence: --key flag  >  CREMA_API_KEY env  >  ~/.crema/config.json
  A key acts with the minting user's role + organization — never broader.
  Mint one in the web app: sidebar → CLI / API → Create key.

ENVIRONMENT
  CREMA_API_KEY    API key used when --key is absent
  CREMA_API_BASE   API base URL used when --base is absent

AGENT NOTES
  Always pass --json: output becomes the raw API response (a stable contract).
  Exit code is 0 on success, 1 on any HTTP or network error.
  On failure with --json, stdout is {"error":"<message>"}.`);
}

// Per-command help: `crema <command> -h` or `crema help <command>`.
function printCommandHelp(name: string): void {
  const c = COMMANDS.find((x) => x.name === name);
  if (!c) fail(`Unknown command: ${name}. Run \`crema -h\` for the catalog.`);
  console.log(renderCommandDoc(c));
}

// `crema help --json` — the entire surface as JSON, the cheapest form for an
// agent to ingest and turn into tool definitions.
function printHelpJson(): void {
  emit({
    name: "crema",
    version: VERSION,
    apiBaseDefault: DEFAULT_BASE,
    openapi: `${DEFAULT_BASE}/api/v1/openapi`,
    globalFlags: GLOBAL_FLAGS,
    env: {
      CREMA_API_KEY: "API key used when --key is absent",
      CREMA_API_BASE: "API base URL used when --base is absent",
    },
    commands: COMMANDS.map((c) => ({
      name: c.name,
      usage: c.usage,
      description: c.description,
      args: c.args,
      flags: c.flags,
      method: c.method,
      returns: c.returns,
      example: c.example,
    })),
  });
}

// ───────────────────────────────── main ────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  jsonMode = args.flags.json === true;
  const command = args.positionals[0] ?? "help";

  // `-v` / `--version` / `version` short-circuit before anything else.
  if (command === "version" || args.flags.version) {
    console.log(VERSION);
    return;
  }

  // `crema help [command] [--json]`
  if (command === "help") {
    const target = args.positionals[1];
    if (target) return void printCommandHelp(target);
    if (jsonMode) return void printHelpJson();
    return void printHelp();
  }

  // `-h` / `--help`: per-command detail when a command is named, else catalog.
  if (args.flags.help) {
    if (COMMANDS.some((c) => c.name === command))
      return void printCommandHelp(command);
    return void printHelp();
  }

  const doc = COMMANDS.find((c) => c.name === command);
  if (!doc || !doc.run) {
    fail(`Unknown command: ${command}. Run \`crema -h\` for the catalog.`);
  }

  const cfg = resolveConfig(args.flags);
  await doc.run(cfg, args);
}

main().catch((e) => fail((e as Error).message));
