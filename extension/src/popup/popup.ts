/**
 * Toolbar popup — the rep's control surface.
 *
 * Shows connection status, the master switch, the per-site capture allow-list,
 * and a one-click "pause everything". All state lives in the service worker;
 * the popup is a thin view that round-trips `popup_*` messages (see the
 * `chrome.runtime.onMessage` handler in src/background/index.ts).
 */

interface SiteRow {
  id: string;
  label: string;
  allowed: boolean;
}

interface PopupState {
  ok: boolean;
  masterEnabled: boolean;
  connection: "idle" | "connecting" | "open" | "closed";
  repId: string | null;
  activity: "idle" | "recording" | "driving";
  sites: SiteRow[];
}

function send<T = unknown>(msg: object): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(resp as T);
    });
  });
}

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing from popup.html`);
  return el as T;
}

const CONN_LABEL: Record<PopupState["connection"], string> = {
  open: "Connected",
  connecting: "Connecting",
  closed: "Reconnecting",
  idle: "Not linked",
};

let state: PopupState | null = null;

function render(): void {
  if (!state) return;

  const conn = $("conn");
  conn.textContent = CONN_LABEL[state.connection] ?? state.connection;
  conn.dataset.status = state.connection;

  $("master-toggle").setAttribute("aria-checked", String(state.masterEnabled));

  const sub = $("master-sub");
  if (!state.masterEnabled) sub.textContent = "Paused — nothing captured or driven";
  else if (state.activity === "driving") sub.textContent = "Driving your browser";
  else if (state.activity === "recording") sub.textContent = "Recording activity";
  else sub.textContent = "On — watching for activity";

  const list = $<HTMLUListElement>("site-list");
  list.textContent = "";
  for (const s of state.sites) {
    const li = document.createElement("li");

    const label = document.createElement("span");
    label.textContent = s.label;

    const cb = document.createElement("button");
    cb.className = "site-switch";
    cb.setAttribute("role", "switch");
    cb.setAttribute("aria-checked", String(s.allowed));
    cb.setAttribute("aria-label", s.label);
    cb.disabled = !state.masterEnabled;
    cb.addEventListener("click", () => {
      void (async () => {
        await send({ type: "popup_set_site", siteId: s.id, enabled: !s.allowed });
        await refresh();
      })();
    });

    li.append(label, cb);
    list.append(li);
  }

  $("rep").textContent = state.repId
    ? `Rep: ${state.repId}`
    : "Not linked to a rep account";
}

async function refresh(): Promise<void> {
  try {
    state = await send<PopupState>({ type: "popup_get_state" });
    render();
  } catch (err) {
    $("conn").textContent = "ASLEEP";
    console.warn("[popup] refresh failed:", err);
  }
}

$("master-toggle").addEventListener("click", () => {
  void (async () => {
    if (!state) return;
    await send({ type: "popup_set_master", enabled: !state.masterEnabled });
    await refresh();
  })();
});

$("pause").addEventListener("click", () => {
  void (async () => {
    await send({ type: "popup_set_master", enabled: false });
    await refresh();
  })();
});

void refresh();
