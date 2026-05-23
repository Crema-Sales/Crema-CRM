// DNS-TXT-verified domain auto-join for orgs.
//
// Flow:
//   1. `requestDomainVerification(orgId, domain)` — admin claims a domain,
//      gets back a `_crema-verify.<domain>` TXT record token to publish.
//   2. The domain owner publishes the TXT record at their DNS.
//   3. `verifyDomain(orgId)` — admin asks the worker to look up the TXT
//      record (via Cloudflare DoH) and stamp `domain_verified_at` if it
//      matches. Until the stamp lands, signups don't auto-join.
//   4. `setDomainJoinEnabled(orgId, true)` — admin opts in to auto-join.
//
// Free-email-provider domains are blocked at claim time so a single user
// can't capture every future Gmail signup.

import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { authPayloadFromCookieHeader } from "./cookies.server";
import { getDB } from "@/db/env.server";
import { logAuditEvent, requireOrgRole } from "@/lib/orgs.server";

// Domains we refuse to let a single org "claim". Anyone signing up with one
// of these would otherwise get pulled into whoever's org grabbed the domain
// first. Not exhaustive — gate at the obvious offenders and let people
// add more later if real users get burned.
const FREE_EMAIL_PROVIDERS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "aol.com",
  "fastmail.com",
  "fastmail.fm",
  "zoho.com",
  "gmx.com",
  "gmx.net",
  "tutanota.com",
  "duck.com",
  "duckduckgo.com",
  "mailinator.com",
  "yopmail.com",
]);

const TXT_PREFIX = "crema-verify=";

function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^_+/, "")
    .replace(/[/].*$/, "")
    .replace(/\.+$/, "");
}

function isDomainAllowed(domain: string): boolean {
  if (!domain.includes(".")) return false;
  if (FREE_EMAIL_PROVIDERS.has(domain)) return false;
  // Basic shape check: only lowercase letters/digits/dots/dashes, must contain a TLD.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return false;
  return true;
}

function mintToken(): string {
  // 24 random bytes → ~32 chars base64url. The prefix in the TXT record
  // makes scanning DNS for crema tokens trivial without ambiguity vs other
  // services' tokens at the same host.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function requireSession() {
  const req = getRequest();
  const payload = await authPayloadFromCookieHeader(req?.headers?.get("cookie"));
  if (!payload) {
    setResponseStatus(401);
    throw new Error("Unauthorized");
  }
  return payload;
}

// Cloudflare DoH JSON API. Pure HTTPS, no DNS-client deps needed in the
// Worker. Returns the array of TXT strings published at `_crema-verify.<domain>`.
async function resolveVerifyTxt(domain: string): Promise<string[]> {
  const host = `_crema-verify.${domain}`;
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", host);
  url.searchParams.set("type", "TXT");
  const res = await fetch(url, {
    headers: { accept: "application/dns-json" },
    // DoH can hang on bad networks; cap aggressively.
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new Error(`DNS lookup failed (HTTP ${res.status})`);
  }
  const body = (await res.json()) as {
    Status?: number;
    Answer?: { type: number; data: string }[];
  };
  if (body.Status !== 0 || !body.Answer) return [];
  // TXT type = 16. The `data` field is a quoted string (sometimes a list of
  // chunks DNS-quoted-and-concatenated). Strip the outer quotes and join
  // chunks so the comparison matches the on-DNS value.
  return body.Answer.filter((a) => a.type === 16).map((a) => {
    // a.data examples: '"crema-verify=abc"' or '"part1" "part2"'
    return a.data
      .split(/"\s+"/)
      .map((chunk) => chunk.replace(/^"|"$/g, ""))
      .join("");
  });
}

const RequestVerificationInput = z.object({
  org_id: z.string().min(1),
  domain: z.string().min(3).max(253),
});

export const requestDomainVerification = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RequestVerificationInput.parse(d))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await requireOrgRole(data.org_id, session.sub, "admin");
    const domain = normalizeDomain(data.domain);
    if (!isDomainAllowed(domain)) {
      throw new Error(
        "That domain can't be claimed for org auto-join (free email providers are blocked)",
      );
    }
    // Refuse if some other org already owns a verified claim on this domain.
    // Unverified claims can co-exist — only verification mints exclusivity.
    const db = getDB();
    const conflict = await db
      .prepare(
        `SELECT id FROM organizations
          WHERE email_domain = ? AND domain_verified_at IS NOT NULL AND id != ?
          LIMIT 1`,
      )
      .bind(domain, data.org_id)
      .first<{ id: string }>();
    if (conflict) {
      throw new Error("Another organization has already verified that domain");
    }
    const token = mintToken();
    await db
      .prepare(
        `UPDATE organizations
            SET email_domain = ?,
                domain_txt_token = ?,
                domain_verified_at = NULL,
                domain_join_enabled = 0
          WHERE id = ?`,
      )
      .bind(domain, token, data.org_id)
      .run();
    await logAuditEvent({
      orgId: data.org_id,
      actorUserId: session.sub,
      action: "domain.claim_requested",
      details: { domain },
    });
    return {
      domain,
      txt_host: `_crema-verify.${domain}`,
      txt_value: `${TXT_PREFIX}${token}`,
    };
  });

const VerifyInput = z.object({ org_id: z.string().min(1) });

export const verifyDomain = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => VerifyInput.parse(d))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await requireOrgRole(data.org_id, session.sub, "admin");
    const db = getDB();
    const org = await db
      .prepare(
        `SELECT email_domain, domain_txt_token FROM organizations WHERE id = ?`,
      )
      .bind(data.org_id)
      .first<{ email_domain: string | null; domain_txt_token: string | null }>();
    if (!org?.email_domain || !org.domain_txt_token) {
      throw new Error("Request a domain claim first");
    }
    const expected = `${TXT_PREFIX}${org.domain_txt_token}`;
    let records: string[] = [];
    try {
      records = await resolveVerifyTxt(org.email_domain);
    } catch (err) {
      throw new Error(
        `Couldn't reach the DNS resolver. Try again in a moment. (${
          err instanceof Error ? err.message : String(err)
        })`,
      );
    }
    const verified = records.includes(expected);
    if (!verified) {
      await logAuditEvent({
        orgId: data.org_id,
        actorUserId: session.sub,
        action: "domain.verification_failed",
        details: { domain: org.email_domain, records_seen: records.length },
      });
      return {
        verified: false as const,
        records_seen: records,
        expected_txt: expected,
        txt_host: `_crema-verify.${org.email_domain}`,
      };
    }
    await db
      .prepare(
        `UPDATE organizations SET domain_verified_at = datetime('now') WHERE id = ?`,
      )
      .bind(data.org_id)
      .run();
    await logAuditEvent({
      orgId: data.org_id,
      actorUserId: session.sub,
      action: "domain.verified",
      details: { domain: org.email_domain },
    });
    return { verified: true as const, domain: org.email_domain };
  });

const SetDomainJoinInput = z.object({
  org_id: z.string().min(1),
  enabled: z.boolean(),
});

export const setDomainJoinEnabled = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SetDomainJoinInput.parse(d))
  .handler(async ({ data }) => {
    const session = await requireSession();
    await requireOrgRole(data.org_id, session.sub, "admin");
    const db = getDB();
    const org = await db
      .prepare(
        `SELECT email_domain, domain_verified_at FROM organizations WHERE id = ?`,
      )
      .bind(data.org_id)
      .first<{ email_domain: string | null; domain_verified_at: string | null }>();
    if (!org?.domain_verified_at) {
      throw new Error("Verify the domain before enabling auto-join");
    }
    await db
      .prepare(`UPDATE organizations SET domain_join_enabled = ? WHERE id = ?`)
      .bind(data.enabled ? 1 : 0, data.org_id)
      .run();
    await logAuditEvent({
      orgId: data.org_id,
      actorUserId: session.sub,
      action: data.enabled ? "domain.join_enabled" : "domain.join_disabled",
      details: { domain: org.email_domain },
    });
    return { ok: true };
  });

const GetStatusInput = z.object({ org_id: z.string().min(1) });

export const getDomainStatus = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => GetStatusInput.parse(d))
  .handler(async ({ data }) => {
    const session = await requireSession();
    // Any member can read the current state (e.g. to show "this org auto-
    // joins teammates from acme.com" in the members tab).
    await requireOrgRole(data.org_id, session.sub, "member");
    const db = getDB();
    const org = await db
      .prepare(
        `SELECT email_domain, domain_verified_at, domain_join_enabled, domain_txt_token
           FROM organizations WHERE id = ?`,
      )
      .bind(data.org_id)
      .first<{
        email_domain: string | null;
        domain_verified_at: string | null;
        domain_join_enabled: number;
        domain_txt_token: string | null;
      }>();
    if (!org) throw new Error("Organization not found");
    return {
      domain: org.email_domain,
      verified_at: org.domain_verified_at,
      join_enabled: org.domain_join_enabled === 1,
      // The TXT record is meaningful only between claim and verification —
      // surface the host + value so the admin doesn't have to remember it.
      pending_txt:
        org.email_domain && !org.domain_verified_at && org.domain_txt_token
          ? {
              host: `_crema-verify.${org.email_domain}`,
              value: `${TXT_PREFIX}${org.domain_txt_token}`,
            }
          : null,
    };
  });
