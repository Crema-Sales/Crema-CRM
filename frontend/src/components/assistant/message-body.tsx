import { Fragment, type ReactNode } from "react";
import { Wrench } from "lucide-react";
import { InlineMarkdown } from "./inline-markdown";

// Renders an assistant message body, swapping inline tool-call markers for
// styled chips. The agent stream (see `agent-stream.ts`) injects a marker
// `[[crema:tool:NAME]]` every time the model invokes a tool; everything else
// is plain conversational text rendered through `InlineMarkdown`.
//
// The legacy markdown form `_🛠 calling `NAME`…_` is matched too so chats
// stored before this change still render as chips on reload.
const TOOL_MARKER_RE =
  /\[\[crema:tool:([^\]]+)\]\]|_🛠 calling `([^`]+)`[…….]*_/g;

// `listCustomers` → "List customers", `get_contact_timeline` → "Get contact
// timeline". Reps don't care about camelCase function names — show a phrase.
function humanizeToolName(name: string): string {
  const spaced = name
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) return name;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function ToolCallChip({ toolName }: { toolName: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
      title={`Crema ran the ${toolName} tool`}
    >
      <Wrench className="size-3 shrink-0 text-primary/70" aria-hidden />
      <span>{humanizeToolName(toolName)}</span>
    </span>
  );
}

type Segment =
  | { type: "text"; value: string }
  | { type: "tool"; toolName: string };

function parse(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOOL_MARKER_RE)) {
    const index = m.index ?? 0;
    if (index > last) segments.push({ type: "text", value: text.slice(last, index) });
    segments.push({ type: "tool", toolName: m[1] ?? m[2] ?? "" });
    last = index + m[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return segments;
}

export function MessageBody({ text }: { text: string }): ReactNode {
  const segments = parse(text);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "tool") {
          return (
            <span key={i} className="my-1 flex">
              <ToolCallChip toolName={seg.toolName} />
            </span>
          );
        }
        // Trim the blank lines that bracket each marker so chips don't leave
        // a visible gap in the `whitespace-pre-wrap` flow.
        const trimmed = seg.value.replace(/^\n+|\n+$/g, "");
        if (!trimmed) return <Fragment key={i} />;
        return <InlineMarkdown key={i} text={trimmed} />;
      })}
    </>
  );
}
