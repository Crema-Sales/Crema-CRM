/**
 * Gmail adapter — captures email_sent and email_received on mail.google.com.
 *
 * DEMO-GRADE: Gmail's DOM is obfuscated and unstable. Selectors below use
 * fallback ladders and are expected to need a live-session tuning pass
 * (drive a real signed-in tab with the `interceptor` CLI). A missed selector
 * degrades to "emit nothing", never a crash.
 *
 *  - email_sent     — delegated click on the compose "Send" button; reads
 *                     recipients/subject/body from the compose dialog.
 *  - email_received — MutationObserver over the inbox list. Rows present at
 *                     adapter start are baselined (they were received before
 *                     this session); only rows that appear afterward emit.
 */

import type { Adapter } from "../types";
import { closestMatch, debounce, hash, onDocumentClick, pick, txt } from "../util";

const SEND_BTN = [
  'div[role=button][data-tooltip^="Send"]',
  'div[role=button][aria-label^="Send"]',
];
const COMPOSE_DIALOG = ["div[role=dialog]", "div.nH.Hd", "div.aoP"];
const LIST_ROOT = ["div[role=main]"];

export const startGmail: Adapter = (emit) => {
  // ── email sent ────────────────────────────────────────────────────────────
  const offClick = onDocumentClick((target) => {
    const btn = closestMatch(target, SEND_BTN);
    if (!btn) return;
    const dialog = closestMatch(btn, COMPOSE_DIALOG) ?? document;

    const chips = Array.from(dialog.querySelectorAll("[email]"))
      .map((c) => ({
        email: (c.getAttribute("email") ?? "").toLowerCase(),
        name: c.getAttribute("name") ?? txt(c),
      }))
      .filter((r) => r.email);
    const to = chips[0];

    const subjectInput = pick(dialog, "input[name=subjectbox]") as HTMLInputElement | null;
    const subject = subjectInput?.value || txt(pick(dialog, "h2.hP"));
    const preview = txt(pick(dialog, "div[aria-label='Message Body']", "div[role=textbox]"));

    emit({
      kind: "email_sent",
      site: "gmail",
      occurredAt: Date.now(),
      contact: to ? { email: to.email, name: to.name } : undefined,
      subject,
      preview,
      url: location.href,
      // bucket to 2s so a double-click on Send coalesces into one event
      dedupeKey: `gmail:sent:${hash((to?.email ?? "") + subject)}:${Math.floor(Date.now() / 2000)}`,
    });
  });

  // ── email received ────────────────────────────────────────────────────────
  const root = pick(document, ...LIST_ROOT);
  const baseline = new Set<string>();

  function rowKey(row: Element): string {
    const id =
      row.querySelector("[data-legacy-thread-id]")?.getAttribute("data-legacy-thread-id") ??
      row.querySelector("[data-thread-id]")?.getAttribute("data-thread-id") ??
      row.getAttribute("id");
    if (id) return id;
    return hash(txt(row).slice(0, 120));
  }

  function scanRows(emitNew: boolean): void {
    const rows = Array.from(document.querySelectorAll("tr.zA"));
    for (const row of rows) {
      const key = rowKey(row);
      if (baseline.has(key)) continue;
      baseline.add(key);
      if (!emitNew) continue;

      const sender = row.querySelector("span[email]");
      const email = (sender?.getAttribute("email") ?? "").toLowerCase();
      const name = sender?.getAttribute("name") ?? txt(sender);
      const subject = txt(pick(row, ".bog", "[data-thread-id] span"));
      const snippet = txt(pick(row, ".y2"));

      emit({
        kind: "email_received",
        site: "gmail",
        occurredAt: Date.now(),
        contact: email || name ? { email: email || undefined, name } : undefined,
        subject,
        preview: snippet,
        url: location.href,
        dedupeKey: `gmail:recv:${key}`,
      });
    }
  }

  // Baseline whatever is already in the inbox — those arrived before this
  // session and must not flood the timeline on page load.
  scanRows(false);

  const observer = new MutationObserver(debounce(() => scanRows(true), 400));
  if (root) observer.observe(root, { childList: true, subtree: true });

  return () => {
    offClick();
    observer.disconnect();
  };
};
