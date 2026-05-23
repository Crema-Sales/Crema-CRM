/**
 * LinkedIn adapter — captures linkedin_comment and linkedin_message on
 * www.linkedin.com.
 *
 * DEMO-GRADE: LinkedIn ships semantic-ish class names (`comments-comment-box`,
 * `msg-form`) that are more stable than Gmail's, but still subject to change.
 * Fallback ladders throughout; a missed selector degrades to no-emit.
 *
 *  - linkedin_comment — delegated click on a comment box "Post" button; the
 *                       counterparty is the author of the post being commented on.
 *  - linkedin_message — delegated click on the messaging "Send" button; the
 *                       counterparty is the conversation's other participant.
 */

import type { Adapter } from "../types";
import { closestMatch, hash, onDocumentClick, pick, txt } from "../util";

const COMMENT_POST_BTN = [
  "button.comments-comment-box__submit-button",
  "button.comments-comment-texteditor__submit",
  "button[class*='comments-comment-box'][class*='submit']",
];
const MSG_SEND_BTN = ["button.msg-form__send-button", "button[class*='msg-form__send']"];

const POST_CONTAINER = ["div.feed-shared-update-v2", "article", "div[data-urn]"];
const POST_AUTHOR = [
  ".update-components-actor__title",
  ".update-components-actor__name",
  "span.feed-shared-actor__name",
];
const THREAD_TITLE = [
  ".msg-entity-lockup__entity-title",
  "h2#thread-detail-jump-target",
  ".msg-thread__link-to-profile",
];

export const startLinkedIn: Adapter = (emit) => {
  const offClick = onDocumentClick((target) => {
    // ── comment posted ──────────────────────────────────────────────────────
    if (closestMatch(target, COMMENT_POST_BTN)) {
      const post = closestMatch(target, POST_CONTAINER);
      const author = post ? txt(pick(post, ...POST_AUTHOR)) : "";
      const urn = post?.getAttribute("data-urn") ?? "";
      const postUrl = urn
        ? `https://www.linkedin.com/feed/update/${urn}`
        : location.href;

      emit({
        kind: "linkedin_comment",
        site: "linkedin",
        occurredAt: Date.now(),
        contact: author ? { name: author } : undefined,
        preview: author ? `Commented on ${author}'s post` : "Commented on a LinkedIn post",
        url: postUrl,
        dedupeKey: `linkedin:comment:${hash(urn + author)}:${Math.floor(Date.now() / 2000)}`,
      });
      return;
    }

    // ── message sent ────────────────────────────────────────────────────────
    if (closestMatch(target, MSG_SEND_BTN)) {
      const titleEl = pick(document, ...THREAD_TITLE);
      const name = txt(titleEl);
      const profileLink = pick(document, "a.msg-thread__link-to-profile") as HTMLAnchorElement | null;
      const draft = txt(pick(document, "div.msg-form__contenteditable", "div[role=textbox]"));

      emit({
        kind: "linkedin_message",
        site: "linkedin",
        occurredAt: Date.now(),
        contact: name
          ? { name, profileUrl: profileLink?.href || undefined }
          : undefined,
        preview: draft,
        url: location.href,
        dedupeKey: `linkedin:msg:${hash(name + draft.slice(0, 40))}:${Math.floor(Date.now() / 2000)}`,
      });
    }
  });

  return () => offClick();
};
