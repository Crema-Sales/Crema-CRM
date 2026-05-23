import { createFileRoute } from "@tanstack/react-router";
import { getOrganizationByGuid } from "@/lib/orgs.server";

function corsHeaders(extra: Record<string, string> = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=300",
    ...extra,
  };
}

// The runtime tracking snippet. Kept self-contained and dependency-free so it
// can be dropped on any host (marketing site, demo form, partner property).
// `__GUID__`, `__ENDPOINT__`, and `__IDENTIFY_ENDPOINT__` are textually
// substituted server-side. See `docs/visitor-identification.md` for the full
// catalog of ways a visitor gets identified.
const SNIPPET_TEMPLATE = `(function () {
  if (window.crema) return;
  var GUID = "__GUID__";
  var ENDPOINT = "__ENDPOINT__";
  var IDENTIFY_ENDPOINT = "__IDENTIFY_ENDPOINT__";
  var ANON_KEY = "crema_anon_id";
  var IDENTIFY_KEY = "crema_identity";
  var EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "anon-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function readCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function writeCookie(name, value, maxAgeSec) {
    document.cookie = name + "=" + encodeURIComponent(value) + "; Path=/; Max-Age=" + maxAgeSec + "; SameSite=Lax";
  }
  function anonId() {
    var existing = readCookie(ANON_KEY);
    if (existing) return existing;
    var fresh = uuid();
    writeCookie(ANON_KEY, fresh, 60 * 60 * 24 * 365 * 2);
    return fresh;
  }
  function identity() {
    var raw = readCookie(IDENTIFY_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function send(payload) {
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
        return;
      }
    } catch (e) {}
    fetch(ENDPOINT, {
      method: "POST",
      body: body,
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
    }).catch(function () {});
  }
  function envelope(event, props) {
    var ident = identity();
    return {
      guid: GUID,
      anonymous_id: anonId(),
      identity_email: ident && ident.email ? ident.email : null,
      identity_traits: ident && ident.traits ? ident.traits : null,
      event: event,
      url: location.href,
      path: location.pathname,
      referrer: document.referrer || null,
      title: document.title || null,
      props: props || null,
      occurred_at: new Date().toISOString(),
    };
  }
  function pageview(extra) {
    send(envelope("pageview", extra || null));
  }
  function track(event, props) {
    send(envelope(event, props || null));
  }
  function identify(email, traits) {
    if (!email) return;
    var payload = { email: String(email).toLowerCase(), traits: traits || null };
    writeCookie(IDENTIFY_KEY, JSON.stringify(payload), 60 * 60 * 24 * 365);
    send(envelope("identify", { email: payload.email, traits: traits || null }));
  }
  function reset() {
    document.cookie = IDENTIFY_KEY + "=; Path=/; Max-Age=0; SameSite=Lax";
  }

  // Server-verified auto-identify from a signed campaign URL. The customer
  // builds ?crema_eid=TOKEN server-side using their org tracking_secret
  // (see Settings - Technical). We call /api/public/identify with a real
  // fetch so we can read the response - only set the identity cookie when
  // the server confirms the signature, otherwise an attacker could forge
  // identities by getting people to click crafted links.
  function readEidParam() {
    var m = location.search.match(/[?&]crema_eid=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function stripEidFromUrl() {
    try {
      var url = new URL(location.href);
      url.searchParams.delete("crema_eid");
      var qs = url.searchParams.toString();
      history.replaceState(history.state, "", url.pathname + (qs ? "?" + qs : "") + url.hash);
    } catch (e) {}
  }
  function verifyAndIdentifyFromUrl() {
    var token = readEidParam();
    if (!token) return;
    var existing = identity();
    fetch(IDENTIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({
        guid: GUID,
        anonymous_id: anonId(),
        crema_eid: token,
        url: location.href,
        path: location.pathname,
        referrer: document.referrer || null,
      }),
    })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (body) {
        stripEidFromUrl();
        if (!body || !body.verified) return;
        // Only persist identity once the server validates the signature.
        if (!existing || existing.email !== body.email) {
          writeCookie(
            IDENTIFY_KEY,
            JSON.stringify({ email: body.email, traits: null }),
            60 * 60 * 24 * 365,
          );
        }
      })
      .catch(function () {});
  }

  // Opt-in form-blur soft-identify: customers call crema.autoCapture() to
  // wire up email-input blur listeners. Off by default — anything that
  // identifies a visitor without consent is dangerous to leave on (GDPR,
  // pipeline pollution from typo'd test emails, etc).
  var autoCaptureWired = false;
  function autoCapture() {
    if (autoCaptureWired) return;
    autoCaptureWired = true;
    document.addEventListener("blur", function (ev) {
      var t = ev.target;
      if (!t || t.tagName !== "INPUT") return;
      var input = t;
      var type = (input.type || "").toLowerCase();
      var name = (input.name || "").toLowerCase();
      var looksEmail = type === "email" || name.indexOf("email") >= 0;
      if (!looksEmail) return;
      var value = (input.value || "").trim();
      if (!EMAIL_RE.test(value)) return;
      var ident = identity();
      if (ident && ident.email === value.toLowerCase()) return;
      identify(value, { source: "autoCapture" });
    }, true);
  }

  // SPA-friendly: re-fire pageview when history changes.
  var lastPath = location.pathname;
  function maybePageview() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    verifyAndIdentifyFromUrl();
    pageview();
  }
  var pushState = history.pushState;
  history.pushState = function () {
    pushState.apply(this, arguments);
    setTimeout(maybePageview, 0);
  };
  window.addEventListener("popstate", maybePageview);

  window.crema = {
    track: track,
    identify: identify,
    pageview: pageview,
    reset: reset,
    autoCapture: autoCapture,
    guid: GUID,
  };
  verifyAndIdentifyFromUrl();
  pageview();
})();
`;

export const Route = createFileRoute("/t/$guid")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),
      GET: async ({ params, request }) => {
        // Allow either /t/<guid> or /t/<guid>.js as the request URL.
        const guid = params.guid.replace(/\.js$/, "");
        const org = await getOrganizationByGuid(guid);
        if (!org) {
          return new Response("// crema: unknown tracking guid\n", {
            status: 404,
            headers: { ...corsHeaders(), "Content-Type": "application/javascript; charset=utf-8" },
          });
        }
        const url = new URL(request.url);
        const endpoint = `${url.origin}/api/public/track`;
        const identifyEndpoint = `${url.origin}/api/public/identify`;
        const body = SNIPPET_TEMPLATE
          .replace("__GUID__", org.tracking_guid)
          .replace("__ENDPOINT__", endpoint)
          .replace("__IDENTIFY_ENDPOINT__", identifyEndpoint);
        return new Response(body, {
          status: 200,
          headers: {
            ...corsHeaders(),
            "Content-Type": "application/javascript; charset=utf-8",
          },
        });
      },
    },
  },
});
