# Visitor identification

How an anonymous visitor on a site running the Crema tracking snippet becomes
a contact in the CRM. Reference for engineers + a cheat-sheet for customer
implementation.

## The funnel

Every page load that runs the snippet (`<script src="https://app.cremasales.com/t/<guid>.js">`)
gets stamped with a random `anonymous_id` cookie. Every event (pageview, custom
track call) is posted to `/api/public/track` and recorded in `funnel_events`
with `contact_id = NULL`.

A visitor becomes a lead the moment we resolve their `anonymous_id` to an
email. Once that happens, the prior anonymous trail is back-stitched to the
new contact (`UPDATE funnel_events SET contact_id = ? WHERE anonymous_id = ?
AND contact_id IS NULL`), so the journey on the Visitor Activity dashboard
shows the full pre-identification history.

The conversion rate on Visitor Activity is `distinct anon_ids that resolved /
distinct anon_ids total`. Every percentage point of lift here comes from one
of the techniques below.

## Identification techniques

### 1. Cookie restore (free, always on)

The snippet sets `crema_anon_id` (long-lived UUID) and, once identified,
`crema_identity` (`{email, traits}`). Subsequent visits in the same browser
re-send the identity on every event. No customer action required.

**Limitation:** scoped to one browser. Clearing cookies, switching devices,
and incognito mode all start fresh.

### 2. Direct `crema.identify()` calls (customer code)

When the customer's own code knows who the visitor is — typically right after
login or right after a form submit — it calls:

```js
window.crema.identify("user@example.com", {
  full_name: "Jane Doe",
  company: "Acme",
});
```

This writes the `crema_identity` cookie *and* sends an `identify` event to
`/api/public/track`. The server upserts a contact and adopts the anonymous
trail. **No signature verification** — anyone running the snippet can claim
any email. Trust model: we trust the embedding site.

**Best for:** post-login auto-identify, form-submit handlers, demo requests.

### 3. Signed campaign URL (`?crema_eid=…`)

For email blasts and outbound campaigns the embedding site doesn't yet know
*who* clicked. The customer's email platform mints a signed token per
recipient and appends it to the landing URL:

```
https://customer.com/welcome?crema_eid=<base64url(email)>.<hmac-sha256-hex-16>
```

When the snippet sees `crema_eid` in the URL, it POSTs the token to
`/api/public/identify`. The server validates the HMAC against the org's
`tracking_secret` (Settings → Technical) and, only on success, identifies the
visitor and writes the cookie. The snippet then strips the param from the
visible URL via `history.replaceState` so refresh doesn't re-validate.

Signing on the customer side (Node.js example):

```js
import { createHmac } from "node:crypto";

function signCremaEid(email, trackingSecret) {
  const encoded = Buffer.from(email.toLowerCase().trim())
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fullSig = createHmac("sha256", trackingSecret)
    .update(encoded)
    .digest("hex");
  return `${encoded}.${fullSig.slice(0, 32)}`;
}
```

Or use the in-app helper in Settings → Technical → "Sign a campaign link".

**Why signed, not raw `?crema_email=`:** without a signature anyone can craft
`https://yoursite.com/?crema_email=ceo@bigfish.com` and post the link in
public places — your pipeline fills with fake leads. Signing closes that
door.

### 4. Opt-in form-blur capture (`crema.autoCapture()`)

For sites with multiple email inputs (newsletter, contact, footer signup)
where wiring `identify()` to every form is tedious, the customer can call
`window.crema.autoCapture()` once. The snippet then listens for blur events
on `<input type="email">` or any input whose `name` contains `email`, and
calls `identify()` with the value if it parses as an email.

**Off by default** because:

- Triggers on every typo'd test email, not just real submits
- Identifies before form submit, which the user may have abandoned on purpose
- GDPR-incompatible without a consent banner that names this behavior

Customers who enable it should pair it with their cookie-consent banner.

### 5. Cross-device cookie merge — not supported

If the same person visits from phone (anon A) and laptop (anon B), they have
two `anonymous_id`s until they identify on each device. When they do
identify, both anon trails resolve to the same contact row by email, but the
*pre-identification* events on the other device remain orphaned (their
`contact_id` was set on identify, but the journey count is split).

We don't merge anonymous trails across devices today. Doing so would require
either fingerprinting (legal/ethical concerns) or a server-side identity
graph (engineering investment that's currently below the line).

## Out of scope

What we *don't* do, and why it's not under "Tier 1":

- **Reverse-IP / company reveal** (Clearbit Reveal, RB2B, Leadfeeder). Resolves
  IP → likely company, not person. Useful but a separate integration tier.
- **Identity-graph "visitor-to-email" services** (Retention.com,
  Customers.ai). Returns an email for some US visitors via opted-in identity
  panels. Legally fraught, brand-risky, GDPR-incompatible.

These are documented in the conversation thread that produced this doc but
explicitly deferred — they're customer-opt-in integrations, not default
platform behavior.

## File map

| Concern | Path |
|---|---|
| Snippet (served at `/t/<guid>.js`) | `frontend/src/routes/t.$guid.tsx` |
| Anonymous event ingest | `frontend/src/routes/api/public/track.ts` |
| Verified identify ingest | `frontend/src/routes/api/public/identify.ts` |
| Sign / verify helpers | `frontend/src/lib/tracking-signature.ts` |
| `signTrackingLink` server fn | `frontend/src/auth/org-fns.ts` |
| Settings UI (snippet + link builder) | `frontend/src/components/org-settings-section.tsx` |
| Visitor Activity page | `frontend/src/routes/_authenticated/traffic.tsx` |
| Help drawer copy | `frontend/src/components/help/content/traffic-help.tsx` |
| Per-org secret migration | `frontend/migrations/0019_org_tracking_secret.sql` |
