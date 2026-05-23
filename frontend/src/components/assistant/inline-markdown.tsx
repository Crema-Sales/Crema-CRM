import { Fragment, type ReactNode } from "react";

// Minimal inline-only markdown for the copilot chat. We deliberately do NOT
// support headers, bullet lists, code blocks, blockquotes, or images — the
// system prompt is tuned for short conversational paragraphs, and rendering
// heavier markup makes the chat feel like a document. Only:
//   **bold**       → <strong>
//   *italic*       → <em>
//   __underline__  → <u>
//   [label](url)   → <a> (http/https/mailto only)
//
// Line breaks are preserved by the surrounding `whitespace-pre-wrap`, so we
// only need to handle inline emphasis here.

type Node =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "underline"; value: string }
  | { type: "link"; value: string; href: string };

// Order matters: longer/double-char tokens (** and __) must come before the
// single-char italic so `**x**` doesn't get eaten as italic-italic.
const INLINE_RE =
  /\*\*([^*\n][^*\n]*?)\*\*|__([^_\n][^_\n]*?)__|\*([^*\n][^*\n]*?)\*|\[([^\]\n]+?)\]\(([^)\s]+)\)/g;

function safeHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return null;
}

function tokenize(input: string): Node[] {
  const nodes: Node[] = [];
  let last = 0;
  for (const m of input.matchAll(INLINE_RE)) {
    const index = m.index ?? 0;
    if (index > last) nodes.push({ type: "text", value: input.slice(last, index) });
    if (m[1] !== undefined) nodes.push({ type: "bold", value: m[1] });
    else if (m[2] !== undefined) nodes.push({ type: "underline", value: m[2] });
    else if (m[3] !== undefined) nodes.push({ type: "italic", value: m[3] });
    else if (m[4] !== undefined && m[5] !== undefined) {
      const href = safeHref(m[5]);
      if (href) nodes.push({ type: "link", value: m[4], href });
      else nodes.push({ type: "text", value: m[0] });
    }
    last = index + m[0].length;
  }
  if (last < input.length) nodes.push({ type: "text", value: input.slice(last) });
  return nodes;
}

export function InlineMarkdown({ text }: { text: string }): ReactNode {
  const nodes = tokenize(text);
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case "bold":
            return (
              <strong key={i} className="font-semibold">
                <InlineMarkdown text={n.value} />
              </strong>
            );
          case "italic":
            return (
              <em key={i}>
                <InlineMarkdown text={n.value} />
              </em>
            );
          case "underline":
            return (
              <u key={i}>
                <InlineMarkdown text={n.value} />
              </u>
            );
          case "link":
            return (
              <a
                key={i}
                href={n.href}
                target={n.href.startsWith("/") ? undefined : "_blank"}
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-primary"
              >
                {n.value}
              </a>
            );
          default:
            return <Fragment key={i}>{n.value}</Fragment>;
        }
      })}
    </>
  );
}
