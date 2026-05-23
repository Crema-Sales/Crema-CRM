/**
 * Command dispatcher — executes commands from the RepAgent DO.
 * Spec: shared/agent-ws-protocol.md § "Command Surface"
 *
 * Commands: navigate | click | type | snapshot | screenshot | eval
 * Error codes: rep_disabled | tab_not_found | selector_not_found | timeout
 *              | eval_not_allowlisted | internal
 *
 * SECURITY: `eval` is allowlisted-only. Server-supplied strings NEVER reach
 * any code-construction primitive (Function ctor, scripting.executeScript's
 * `func` from a string, setTimeout(string), …). Chrome Web Store will reject
 * the extension otherwise — this is a hard security boundary.
 */

export interface Command {
  id: string;
  type: string;
  params?: Record<string, unknown>;
}

export interface CommandResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

const SNAPSHOT_DEFAULT_CAP = 1_000_000;

type Allowlisted = (args: Record<string, unknown>, tabId: number) => Promise<unknown>;

const EVAL_ALLOWLIST: Record<string, Allowlisted> = {
  page_title: async (_args, tabId) => {
    const out = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.title,
    });
    return { value: out[0]?.result ?? "" };
  },
  page_url: async (_args, tabId) => {
    const tab = await chrome.tabs.get(tabId);
    return { value: tab.url ?? "" };
  },
};

export async function dispatch(cmd: Command): Promise<CommandResponse> {
  try {
    switch (cmd.type) {
      case "navigate":
        return ok(cmd.id, await cmdNavigate(cmd.params ?? {}));
      case "click":
        return ok(cmd.id, await cmdClick(cmd.params ?? {}));
      case "type":
        return ok(cmd.id, await cmdType(cmd.params ?? {}));
      case "snapshot":
        return ok(cmd.id, await cmdSnapshot(cmd.params ?? {}));
      case "screenshot":
        return ok(cmd.id, await cmdScreenshot(cmd.params ?? {}));
      case "eval":
        return ok(cmd.id, await cmdEval(cmd.params ?? {}));
      default:
        return fail(cmd.id, "internal", `unknown command: ${cmd.type}`);
    }
  } catch (err) {
    const code = (err as { code?: string }).code;
    const msg = (err as Error).message ?? String(err);
    console.warn(`[dispatch] ${cmd.type} failed:`, err);
    return fail(cmd.id, code ?? "internal", msg);
  }
}

function ok(id: string, result: unknown): CommandResponse {
  return { id, ok: true, result };
}
function fail(id: string, error: string, message?: string): CommandResponse {
  if (message) return { id, ok: false, error, result: { message } };
  return { id, ok: false, error };
}

function str(p: Record<string, unknown>, k: string): string | undefined {
  const v = p[k];
  return typeof v === "string" ? v : undefined;
}
function num(p: Record<string, unknown>, k: string): number | undefined {
  const v = p[k];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function bool(p: Record<string, unknown>, k: string): boolean | undefined {
  const v = p[k];
  return typeof v === "boolean" ? v : undefined;
}

class CmdError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

async function getTab(tabId?: number): Promise<chrome.tabs.Tab> {
  if (tabId === undefined) throw new CmdError("tab_not_found", "tabId required");
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    throw new CmdError("tab_not_found", `tab ${tabId} not found`);
  }
}

// ─── navigate ─────────────────────────────────────────────────────────────────

async function cmdNavigate(p: Record<string, unknown>) {
  const url = str(p, "url");
  if (!url) throw new CmdError("internal", "url required");
  let tabId = num(p, "tabId");

  let tab: chrome.tabs.Tab;
  if (tabId === undefined) {
    tab = await chrome.tabs.create({ url });
    tabId = tab.id;
  } else {
    tab = await getTab(tabId);
    await chrome.tabs.update(tabId, { url });
  }
  if (tabId === undefined) throw new CmdError("internal", "tab creation returned no id");

  await waitForLoad(tabId, 30_000);
  return { tabId };
}

function waitForLoad(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new CmdError("timeout", `tab ${tabId} load timed out`));
    }, timeoutMs);
    const listener = (updatedId: number, info: chrome.tabs.TabChangeInfo) => {
      if (updatedId !== tabId) return;
      if (info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ─── click ────────────────────────────────────────────────────────────────────

async function cmdClick(p: Record<string, unknown>) {
  const tabId = num(p, "tabId");
  const selector = str(p, "selector");
  const cdp = bool(p, "cdp") ?? false;
  if (tabId === undefined) throw new CmdError("tab_not_found", "tabId required");
  if (!selector) throw new CmdError("internal", "selector required");
  await getTab(tabId);

  if (cdp) return clickViaCdp(tabId, selector);

  const out = await chrome.scripting.executeScript({
    target: { tabId },
    args: [selector],
    func: (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return { found: false };
      el.click();
      return { found: true };
    },
  });
  const result = out[0]?.result as { found?: boolean } | undefined;
  if (!result?.found) throw new CmdError("selector_not_found", selector);
  return {};
}

// ─── type ─────────────────────────────────────────────────────────────────────

async function cmdType(p: Record<string, unknown>) {
  const tabId = num(p, "tabId");
  const selector = str(p, "selector");
  const text = str(p, "text") ?? "";
  const cdp = bool(p, "cdp") ?? false;
  if (tabId === undefined) throw new CmdError("tab_not_found", "tabId required");
  if (!selector) throw new CmdError("internal", "selector required");
  await getTab(tabId);

  if (cdp) return typeViaCdp(tabId, selector, text);

  const out = await chrome.scripting.executeScript({
    target: { tabId },
    args: [selector, text],
    func: (sel: string, value: string) => {
      const el = document.querySelector(sel) as
        | HTMLInputElement
        | HTMLTextAreaElement
        | (HTMLElement & { isContentEditable?: boolean })
        | null;
      if (!el) return { found: false };
      el.focus?.();
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const setter = Object.getOwnPropertyDescriptor(
          el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
          "value",
        )?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (el.isContentEditable) {
        el.textContent = value;
        el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      } else {
        return { found: false };
      }
      return { found: true };
    },
  });
  const result = out[0]?.result as { found?: boolean } | undefined;
  if (!result?.found) throw new CmdError("selector_not_found", selector);
  return {};
}

// ─── snapshot ─────────────────────────────────────────────────────────────────

async function cmdSnapshot(p: Record<string, unknown>) {
  const tabId = num(p, "tabId");
  const maxBytes = num(p, "max_bytes") ?? SNAPSHOT_DEFAULT_CAP;
  if (tabId === undefined) throw new CmdError("tab_not_found", "tabId required");
  await getTab(tabId);
  const out = await chrome.scripting.executeScript({
    target: { tabId },
    args: [maxBytes],
    func: (cap: number) => {
      const html = document.documentElement.outerHTML;
      return html.length > cap ? html.slice(0, cap) : html;
    },
  });
  const html = (out[0]?.result as string) ?? "";
  return { html };
}

// ─── screenshot ───────────────────────────────────────────────────────────────

async function cmdScreenshot(p: Record<string, unknown>) {
  const tabId = num(p, "tabId");
  const format = (str(p, "format") as "png" | "jpeg" | undefined) ?? "png";
  if (tabId === undefined) throw new CmdError("tab_not_found", "tabId required");
  const tab = await getTab(tabId);
  if (tab.windowId === undefined) throw new CmdError("internal", "tab missing windowId");
  const data_url = await chrome.tabs.captureVisibleTab(tab.windowId, { format });
  return { data_url };
}

// ─── eval (allowlisted) ───────────────────────────────────────────────────────

async function cmdEval(p: Record<string, unknown>) {
  const tabId = num(p, "tabId");
  const name = str(p, "name");
  const args = (p.args && typeof p.args === "object" ? (p.args as Record<string, unknown>) : {});
  if (tabId === undefined) throw new CmdError("tab_not_found", "tabId required");
  if (!name) throw new CmdError("eval_not_allowlisted", "name required");
  const fn = EVAL_ALLOWLIST[name];
  if (!fn) throw new CmdError("eval_not_allowlisted", name);
  return fn(args, tabId);
}

// ─── CDP variants ─────────────────────────────────────────────────────────────

async function clickViaCdp(tabId: number, selector: string) {
  await chrome.debugger.attach({ tabId }, "1.3");
  try {
    const rect = await resolveRect(tabId, selector);
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    await sendCdp(tabId, "Input.dispatchMouseEvent", {
      type: "mousePressed", x, y, button: "left", clickCount: 1,
    });
    await sendCdp(tabId, "Input.dispatchMouseEvent", {
      type: "mouseReleased", x, y, button: "left", clickCount: 1,
    });
    return {};
  } finally {
    await safeDetach(tabId);
  }
}

async function typeViaCdp(tabId: number, selector: string, text: string) {
  await chrome.debugger.attach({ tabId }, "1.3");
  try {
    await sendCdp(tabId, "Runtime.evaluate", {
      expression:
        `(function(){var el=document.querySelector(${JSON.stringify(selector)});if(el&&el.focus)el.focus();return !!el;})()`,
      returnByValue: true,
    });
    for (const ch of text) {
      await sendCdp(tabId, "Input.dispatchKeyEvent", { type: "keyDown", text: ch });
      await sendCdp(tabId, "Input.dispatchKeyEvent", { type: "keyUp", text: ch });
    }
    return {};
  } finally {
    await safeDetach(tabId);
  }
}

interface Rect { x: number; y: number; width: number; height: number }
async function resolveRect(tabId: number, selector: string): Promise<Rect> {
  const res = (await sendCdp(tabId, "Runtime.evaluate", {
    expression:
      `(function(){var el=document.querySelector(${JSON.stringify(selector)});if(!el)return null;var r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`,
    returnByValue: true,
  })) as { result?: { value?: Rect | null } };
  const rect = res.result?.value;
  if (!rect) throw new CmdError("selector_not_found", selector);
  return rect;
}

function sendCdp(tabId: number, method: string, params: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new CmdError("internal", err.message));
      else resolve(result);
    });
  });
}

async function safeDetach(tabId: number): Promise<void> {
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // ignore — fine if already detached
  }
}
