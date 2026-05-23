// Branded transactional email layout. Pure string templating — no JSX, no
// React, no Tailwind. Inline CSS only because Gmail / Outlook / iOS Mail
// strip <style> blocks unpredictably. Callers compose by importing one of
// the variants under templates/ and passing { subject, html, text } to
// sendEmail() in client.ts.
//
// Brand palette is the email-safe hex approximation of the OKLCH values in
// frontend/src/styles.css. Email clients don't speak oklch.

export interface EmailLayoutOpts {
  /** Hidden preheader Gmail and iOS Mail show in the inbox preview row. */
  previewText: string;
  heading: string;
  /** Pre-rendered HTML body — caller controls paragraph structure. NOT escaped. */
  body: string;
  cta?: { label: string; url: string };
  /** Small print rendered above the unsubscribe block. */
  footerNote?: string;
  /** Omit for transactional sends (verification). Wires the unsub footer link. */
  unsubscribeUrl?: string;
}

const COLORS = {
  bg: "#f6f1e8",
  fg: "#3a2418",
  accent: "#c9885a",
  muted: "#8a6f5d",
  border: "#e8ddd0",
  card: "#fdfaf4",
  btnText: "#fdfaf4",
} as const;

// System font stack — no web fonts in email. Resilient across every client.
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// Static physical address — CAN-SPAM requires a postal address on commercial
// mail. Replace when Crema, Inc. files real registration paperwork.
const POSTAL_ADDRESS = "Crema, Inc. · 2261 Market St #1234 · San Francisco, CA 94114";

// Gmail clips messages over ~102KB. Our shell weighs <4KB; cap body at 80KB
// so we never lose the unsubscribe footer. Throws because a silently-clipped
// email is worse than a build-time error.
const MAX_BODY_BYTES = 80 * 1024;

export function renderEmail(opts: EmailLayoutOpts): string {
  if (opts.body.length > MAX_BODY_BYTES) {
    throw new Error(
      `Email body too large: ${opts.body.length} bytes > ${MAX_BODY_BYTES} max (Gmail clipping risk)`,
    );
  }

  const heading = escapeHtml(opts.heading);
  const cta = opts.cta ? ctaButton(opts.cta) : "";
  const footerLines: string[] = [];
  if (opts.footerNote) {
    footerLines.push(
      `<p style="margin:0 0 12px 0;font:13px/1.6 ${FONT_STACK};color:${COLORS.muted}">${escapeHtml(opts.footerNote)}</p>`,
    );
  }
  if (opts.unsubscribeUrl) {
    const url = escapeAttr(opts.unsubscribeUrl);
    footerLines.push(
      `<p style="margin:0 0 12px 0;font:12px/1.6 ${FONT_STACK};color:${COLORS.muted}">
        <a href="${url}" style="color:${COLORS.muted};text-decoration:underline">Unsubscribe from this category</a>
        &nbsp;·&nbsp;
        <a href="${url}&amp;all=1" style="color:${COLORS.muted};text-decoration:underline">Unsubscribe from all</a>
      </p>`,
    );
  }
  footerLines.push(
    `<p style="margin:0 0 12px 0;font:12px/1.6 ${FONT_STACK};color:${COLORS.muted}">${escapeHtml(POSTAL_ADDRESS)}</p>`,
    `<p style="margin:0;font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:${COLORS.muted};letter-spacing:0.04em;text-transform:uppercase">v1 · cremasales.com</p>`,
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${heading}</title>
<style>
  @media (prefers-color-scheme: dark) {
    /* Soften iOS Mail's auto-invert. Keep cream-ish even in dark mode rather
       than fighting a black background. The color-scheme meta above tells
       supporting clients to skip auto-invert entirely. */
    body, table, td { background-color: ${COLORS.bg} !important; }
  }
  a:hover { opacity: 0.85; }
</style>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};font-family:${FONT_STACK};-webkit-font-smoothing:antialiased">
${previewBlock(opts.previewText)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${COLORS.bg};padding:32px 16px">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background-color:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;overflow:hidden">
        <tr>
          <td style="padding:32px 40px 8px 40px">
            <p style="margin:0;font:700 28px/1 ${FONT_STACK};color:${COLORS.fg};letter-spacing:-0.02em"><span style="font-size:24px;margin-right:8px;vertical-align:-1px" role="img" aria-label="coffee">&#9749;</span>Crema<span style="color:${COLORS.accent}">.</span></p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px 8px 40px">
            <h1 style="margin:0;font:700 24px/1.2 ${FONT_STACK};color:${COLORS.fg}">${heading}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 40px 0 40px;font:400 16px/1.6 ${FONT_STACK};color:${COLORS.fg}">
            ${opts.body}
          </td>
        </tr>
        ${cta ? `<tr><td style="padding:8px 40px 32px 40px">${cta}</td></tr>` : `<tr><td style="padding:0 40px 32px 40px"></td></tr>`}
        <tr>
          <td style="padding:0 40px"><div style="border-top:1px solid ${COLORS.border};font-size:0;line-height:0">&nbsp;</div></td>
        </tr>
        <tr>
          <td style="padding:24px 40px 32px 40px">
            ${footerLines.join("\n            ")}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// Plain-text fallback. Stored in email_sends audit and sent as the multipart
// text/plain alternative so accessibility tools and plain-text-only clients
// get a readable version.
export function renderEmailText(opts: EmailLayoutOpts): string {
  const lines = [
    opts.heading,
    "",
    stripHtmlToText(opts.body),
  ];
  if (opts.cta) {
    lines.push("", `${opts.cta.label}: ${opts.cta.url}`);
  }
  if (opts.footerNote) {
    lines.push("", opts.footerNote);
  }
  if (opts.unsubscribeUrl) {
    lines.push("", `Unsubscribe from this category: ${opts.unsubscribeUrl}`);
    lines.push(`Unsubscribe from all: ${opts.unsubscribeUrl}&all=1`);
  }
  lines.push("", POSTAL_ADDRESS);
  return lines.join("\n");
}

function ctaButton(cta: { label: string; url: string }): string {
  const label = escapeHtml(cta.label);
  const url = escapeAttr(cta.url);
  // Outer <table> for Outlook (which ignores border-radius on <a> but renders
  // the rounded table cell shape). The <a> handles the rest.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0 0">
  <tr>
    <td style="background-color:${COLORS.accent};border-radius:8px">
      <a href="${url}" style="display:inline-block;padding:14px 28px;font:700 14px/1 ${FONT_STACK};color:${COLORS.btnText};text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;border-radius:8px">${label}</a>
    </td>
  </tr>
</table>`;
}

// Hidden preheader. The filler &nbsp; padding stops Gmail's preview pane from
// bleeding the body's first line into the inbox row. font-size 1px + display
// none + max-height 0 + opacity 0 are belt-and-suspenders because no single
// trick works across every client.
function previewBlock(text: string): string {
  const filler = "&nbsp;".repeat(120);
  return `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeHtml(text)}${filler}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

// Same as escapeHtml but explicit about being used in attribute context (URLs
// in href/src). Quotes and ampersands are the load-bearing ones.
function escapeAttr(s: string): string {
  return s.replace(/[&"]/g, (c) => (c === "&" ? "&amp;" : "&quot;"));
}

// Lossy HTML → text. Good enough for the plain-text alternative because body
// content is always paragraphs + maybe a link, not nested tables.
function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Public helper for body builders that want to interpolate dynamic strings
// (URLs, names, org names) into hand-written HTML safely.
export function escapeForBody(s: string): string {
  return escapeHtml(s);
}
