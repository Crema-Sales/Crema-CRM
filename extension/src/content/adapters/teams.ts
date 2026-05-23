/**
 * Microsoft Teams adapter — captures teams_message on teams.microsoft.com.
 *
 * DEMO-GRADE: Teams exposes `data-tid` test hooks that are reasonably stable,
 * used here with fallback ladders. A missed selector degrades to no-emit.
 *
 *  - teams_message — delegated click on the compose "Send" button; the
 *                    counterparty is the chat/channel title in the header.
 */

import type { Adapter } from "../types";
import { closestMatch, hash, onDocumentClick, pick, txt } from "../util";

const SEND_BTN = [
  'button[data-tid="newMessageCommands-send"]',
  'button[name="send"]',
  'button[aria-label^="Send" i]',
];
const CHAT_TITLE = [
  '[data-tid="chat-header-title"]',
  '[data-tid="threadHeaderTitle"]',
  '[data-tid="title"]',
  "h1, h2",
];
const COMPOSE_BOX = [
  'div[data-tid="ckeditor"]',
  'div[role=textbox]',
  "div[contenteditable=true]",
];

export const startTeams: Adapter = (emit) => {
  const offClick = onDocumentClick((target) => {
    if (!closestMatch(target, SEND_BTN)) return;

    const title = txt(pick(document, ...CHAT_TITLE));
    const draft = txt(pick(document, ...COMPOSE_BOX));

    emit({
      kind: "teams_message",
      site: "teams",
      occurredAt: Date.now(),
      contact: title ? { name: title } : undefined,
      preview: draft,
      url: location.href,
      dedupeKey: `teams:msg:${hash(title + draft.slice(0, 40))}:${Math.floor(Date.now() / 2000)}`,
    });
  });

  return () => offClick();
};
