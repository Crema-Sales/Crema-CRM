// Single owner of every alias:* KV key. Per AGENTS-WORKERS.md: "never
// read/write alias keys from anywhere else."
//
// Key shapes:
//   alias:email:<addr>          → customer_id
//   alias:anonymous_id:<id>     → customer_id
//   alias:user_id:<uid>         → customer_id

import * as db from "./db";
import type { Env } from "./index";

export type Identity = {
  anonymousId?: string;
  email?: string;
  userId?: string;
};

export type ResolveResult = {
  customerId: string;
  resolved: "existing" | "created" | "merged";
};

function keyEmail(addr: string): string {
  return `alias:email:${addr.toLowerCase()}`;
}
function keyAnon(id: string): string {
  return `alias:anonymous_id:${id}`;
}
function keyUser(uid: string): string {
  return `alias:user_id:${uid}`;
}

function aliasKeysFor(identity: Identity): string[] {
  const keys: string[] = [];
  if (identity.email) keys.push(keyEmail(identity.email));
  if (identity.anonymousId) keys.push(keyAnon(identity.anonymousId));
  if (identity.userId) keys.push(keyUser(identity.userId));
  return keys;
}

async function lookupAll(env: Env, keys: string[]): Promise<Map<string, string>> {
  const hits = new Map<string, string>();
  await Promise.all(
    keys.map(async (k) => {
      const v = await env.IDENTITY.get(k);
      if (v) hits.set(k, v);
    }),
  );
  return hits;
}

async function writeAliases(env: Env, identity: Identity, customerId: string): Promise<void> {
  await Promise.all(
    aliasKeysFor(identity).map((k) => env.IDENTITY.put(k, customerId)),
  );
}

export async function resolveOrCreateCustomer(
  env: Env,
  identity: Identity,
): Promise<ResolveResult> {
  const keys = aliasKeysFor(identity);
  if (keys.length === 0) {
    throw new Error("resolveOrCreateCustomer: identity must contain at least one of email/anonymousId/userId");
  }

  const hits = await lookupAll(env, keys);
  const distinct = new Set(hits.values());

  if (distinct.size === 1) {
    const customerId = [...distinct][0]!;
    // Backfill any missing aliases so the next lookup is a single KV hit.
    const missing = keys.filter((k) => !hits.has(k));
    if (missing.length > 0) {
      await Promise.all(missing.map((k) => env.IDENTITY.put(k, customerId)));
    }
    return { customerId, resolved: "existing" };
  }

  if (distinct.size > 1) {
    // Conflict — pick the oldest customer by created_at and rewrite the
    // losing aliases. We don't merge customer rows themselves; that's a
    // downstream concern with audit implications.
    const candidates = await Promise.all(
      [...distinct].map((id) => db.getCustomer(env, id)),
    );
    const ordered = candidates
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const winner = ordered[0];
    if (!winner) {
      // All hit ids reference customers that no longer exist — clean up and create.
      await Promise.all(keys.map((k) => env.IDENTITY.delete(k)));
    } else {
      await Promise.all(keys.map((k) => env.IDENTITY.put(k, winner.id)));
      return { customerId: winner.id, resolved: "merged" };
    }
  }

  // KV miss — before creating a new customer, check if D1 already has one
  // with this email. The seeded customers are reachable this way until their
  // aliases get backfilled here on first hit.
  if (identity.email) {
    const existing = await db.findCustomerByEmail(env, identity.email);
    if (existing) {
      await writeAliases(env, identity, existing.id);
      return { customerId: existing.id, resolved: "existing" };
    }
  }

  // No hit — create.
  const fallbackName =
    identity.email ?? identity.anonymousId ?? identity.userId ?? "Unknown visitor";
  const email = identity.email ?? `anon-${identity.anonymousId ?? identity.userId ?? "x"}@unknown.local`;
  const created = await db.createCustomer(
    env,
    { name: fallbackName, email, status: "prospect" },
    "rep_demo",
  );
  await writeAliases(env, identity, created.id);
  return { customerId: created.id, resolved: "created" };
}

/**
 * Resolve an email to an EXISTING customer without ever creating one.
 * Returns the customer id, or `null` if the address is not a known contact.
 *
 * Used for inbound-email capture (extension `activity_event` of kind
 * `email_received`): per agent-ws-protocol.md v0.2 we log a received email
 * only when the sender is already a customer — we never spawn a customer
 * record from mail the rep merely received.
 */
export async function resolveExistingCustomerByEmail(
  env: Env,
  email: string,
): Promise<string | null> {
  const key = keyEmail(email);
  const viaAlias = await env.IDENTITY.get(key);
  if (viaAlias) return viaAlias;

  const existing = await db.findCustomerByEmail(env, email);
  if (existing) {
    // Backfill the alias so the next inbound mail is a single KV hit.
    await env.IDENTITY.put(key, existing.id);
    return existing.id;
  }
  return null;
}

export async function listAliases(env: Env, customerId: string): Promise<string[]> {
  // KV doesn't expose a reverse index, so we list-and-filter. Cheap for the
  // demo's small key count; production would maintain an explicit reverse map.
  const result: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.IDENTITY.list({ prefix: "alias:", cursor });
    for (const k of page.keys) {
      const v = await env.IDENTITY.get(k.name);
      if (v === customerId) result.push(k.name);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return result;
}
