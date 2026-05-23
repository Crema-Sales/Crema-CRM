/**
 * Command-ID dedup LRU.
 *
 * If the DO re-delivers a command id after a reconnect drain (e.g. our ack
 * was sent but the socket dropped before the DO could remove the entry from
 * its queue), we MUST replay the same response — re-executing could cause
 * double clicks / double navigations.
 *
 * Spec: TODO F7 in extension/TODO.md.
 *
 * Survives within a service-worker lifetime only. Cold-restart of the SW
 * loses the cache, in which case duplicate execution is possible — accepted
 * tradeoff vs. persisting every ack to chrome.storage.
 */

import type { CommandResponse } from "./dispatch";

const CAPACITY = 256;

const order: string[] = [];
const cache = new Map<string, CommandResponse>();

export function rememberAck(id: string, resp: CommandResponse): void {
  if (cache.has(id)) {
    // refresh insertion order
    const idx = order.indexOf(id);
    if (idx >= 0) order.splice(idx, 1);
  } else if (order.length >= CAPACITY) {
    const evict = order.shift();
    if (evict !== undefined) cache.delete(evict);
  }
  cache.set(id, resp);
  order.push(id);
}

export function recallAck(id: string): CommandResponse | undefined {
  return cache.get(id);
}

// Test-only — not used at runtime.
export function _resetForTests(): void {
  order.length = 0;
  cache.clear();
}
