/**
 * Outlook-on-the-web adapter — captures email_sent and email_received on
 * outlook.office.com / outlook.office365.com / outlook.live.com.
 *
 * DEMO-GRADE: Outlook's React DOM is highly dynamic and class names are
 * hashed. Detection leans on stable `aria-label` / `role` attributes with
 * fallback ladders, and is expected to need a live-session tuning pass.
 *
 *  - email_sent     — delegated click on the "Send" command-bar button.
 *  - email_received — MutationObserver over the message list; rows present
 *                     at adapter start are baselined.
 */

import type { Adapter } from "../types";
import { closestMatch, debounce, extractEmail, hash, onDocumentClick, pick, txt } from "../util";

const SEND_BTN = [
  'button[aria-label="Send"]',
  'button[aria-label^="Send" i]',
  'div[aria-label="Send"][role=button]',
];
const COMPOSE = ['div[aria-label="Message body"]', 'div[role=dialog]', "div[aria-label*='compose' i]"];
const LIST_ROOT = ['div[role=listbox]', 'div[role=list]', "div[aria-label*='message list' i]"];

export const startOutlook: Adapter = (emit) => {
  // ── email sent ────────────────────────────────────────────────────────────
  const offClick = onDocumentClick((target) => {
    const btn = closestMatch(target, SEND_BTN);
    if (!btn) return;
    const dialog = closestMatch(btn, COMPOSE) ?? document;

    // Recipient wells render as role=option pills carrying a title/aria-label.
    const pill = pick(
      dialog,
      'div[role=option][title*="@"]',
      'span[title*="@"]',
      'div[aria-label*="@"]',
    );
    const pillText = pill ? `${pill.getAttribute("title") ?? ""} ${txt(pill)}` : "";
    const email = extractEmail(pillText);
    const name = pill?.getAttribute("title")?.replace(/<[^>]*>/g, "").trim() || txt(pill) || undefined;

    const subjectEl = pick(dialog, 'input[aria-label*="subject" i]') as HTMLInputElement | null;
    const subject = subjectEl?.value ?? "";
    const preview = txt(pick(dialog, 'div[aria-label="Message body"]', "div[role=textbox]"));

    emit({
      kind: "email_sent",
      site: "outlook",
      occurredAt: Date.now(),
      contact: email || name ? { email, name } : undefined,
      subject,
      preview,
      url: location.href,
      dedupeKey: `outlook:sent:${hash((email ?? "") + subject)}:${Math.floor(Date.now() / 2000)}`,
    });
  });

  // ── email received ────────────────────────────────────────────────────────
  const root = pick(document, ...LIST_ROOT);
  const baseline = new Set<string>();

  function scanRows(emitNew: boolean): void {
    const rows = Array.from(document.querySelectorAll('div[role=option]'));
    for (const row of rows) {
      const label = row.getAttribute("aria-label") ?? txt(row);
      const key = row.getAttribute("data-convid") ?? hash(label.slice(0, 140));
      if (baseline.has(key)) continue;
      baseline.add(key);
      if (!emitNew) continue;

      const senderEl = pick(row, "span[title]", "[class*='SenderName']");
      const name = senderEl?.getAttribute("title") || txt(senderEl) || undefined;
      const email = extractEmail(label);

      emit({
        kind: "email_received",
        site: "outlook",
        occurredAt: Date.now(),
        contact: email || name ? { email, name } : undefined,
        preview: label,
        url: location.href,
        dedupeKey: `outlook:recv:${key}`,
      });
    }
  }

  scanRows(false);

  const observer = new MutationObserver(debounce(() => scanRows(true), 400));
  if (root) observer.observe(root, { childList: true, subtree: true });

  return () => {
    offClick();
    observer.disconnect();
  };
};
