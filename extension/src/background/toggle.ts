/**
 * Rep-side master switch + activity indicator.
 * Spec: shared/agent-ws-protocol.md § "Rep-Side Master Switch"
 *
 * Two independent signals drive the toolbar:
 *  - master switch (persisted `agentEnabled`) — the rep's ON/OFF consent gate.
 *  - activity state (runtime only) — `idle` | `recording` | `driving`, the
 *    "toolbar light" the marketing site promises. `recording` pulses when an
 *    ambient-capture event fires; `driving` shows while a command from the DO
 *    executes. Both decay back to `idle` on their own.
 *
 * The master switch is now edited from the popup (`chrome.action.onClicked`
 * no longer fires once `default_popup` is set), so there is no toolbar-click
 * listener here anymore.
 */

import type { AgentSocket } from "./ws-client";

const STORAGE_KEY = "agentEnabled";

const COLOR_ON = "#16a34a";
const COLOR_REC = "#d97706";
const COLOR_DRV = "#2563eb";
const ICON_ON = "icons/agent-on-128.png";
const ICON_OFF = "icons/agent-off-128.png";

const RECORDING_DECAY_MS = 4_000;
const DRIVING_DECAY_MS = 20_000;

export type ActivityState = "idle" | "recording" | "driving";

let activity: ActivityState = "idle";
let decayTimer: ReturnType<typeof setTimeout> | null = null;

export async function getEnabled(): Promise<boolean> {
  // TODO(sec): re-tighten before CWS publish — default should be `false` so a
  // freshly-installed extension stays inert until the rep explicitly opts in.
  const out = await chrome.storage.local.get(STORAGE_KEY);
  return out[STORAGE_KEY] !== false;
}

export async function setEnabled(value: boolean, socket?: AgentSocket): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: value });
  if (!value) activity = "idle";
  await paint(value);
  if (socket) socket.send({ type: "toggle", enabled: value });
}

export function getActivity(): ActivityState {
  return activity;
}

/**
 * Flag a transient activity state. It auto-decays back to `idle` so a pulse
 * clears itself without the caller needing to reset it. A master-OFF
 * extension ignores activity entirely.
 */
export async function setActivity(next: ActivityState): Promise<void> {
  if (decayTimer) {
    clearTimeout(decayTimer);
    decayTimer = null;
  }
  activity = next;
  const enabled = await getEnabled();
  await paint(enabled);
  if (next !== "idle" && enabled) {
    const ms = next === "recording" ? RECORDING_DECAY_MS : DRIVING_DECAY_MS;
    decayTimer = setTimeout(() => {
      decayTimer = null;
      activity = "idle";
      void getEnabled().then((e) => paint(e));
    }, ms);
  }
}

export async function applyVisualState(enabled: boolean): Promise<void> {
  await paint(enabled);
}

async function paint(enabled: boolean): Promise<void> {
  const icon = enabled ? ICON_ON : ICON_OFF;
  try {
    await chrome.action.setIcon({ path: { 16: icon, 32: icon, 48: icon, 128: icon } });
  } catch (err) {
    console.warn("[toggle] setIcon failed:", err);
  }

  let badge = "";
  let badgeColor = COLOR_ON;
  let title = "Crema Sales Agent — Off";
  if (enabled) {
    title = "Crema Sales Agent — On";
    if (activity === "recording") {
      badge = "REC";
      badgeColor = COLOR_REC;
      title = "Crema Sales Agent — Recording activity";
    } else if (activity === "driving") {
      badge = "DRV";
      badgeColor = COLOR_DRV;
      title = "Crema Sales Agent — Driving the browser";
    }
  }
  try {
    await chrome.action.setBadgeText({ text: badge });
    if (badge) await chrome.action.setBadgeBackgroundColor({ color: badgeColor });
    await chrome.action.setTitle({ title });
  } catch (err) {
    console.warn("[toggle] badge/title failed:", err);
  }
}
