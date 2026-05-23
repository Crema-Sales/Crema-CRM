// mulberry32 — small, fast, decent-quality 32-bit PRNG. Used so that passing
// --seed N produces a reproducible run end-to-end. With no seed, we draw a
// fresh one from Math.random() and print it so a run can be replayed.
export function makeRng(seed: number) {
  let s = seed >>> 0;
  return {
    seed,
    next(): number {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    },
  };
}

export type Rng = ReturnType<typeof makeRng>;

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng.next() * arr.length)];
}

export function pickN<T>(rng: Rng, arr: readonly T[], n: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(pick(rng, arr));
  return out;
}

export function intBetween(rng: Rng, min: number, max: number): number {
  return Math.floor(rng.next() * (max - min + 1)) + min;
}

export function chance(rng: Rng, p: number): boolean {
  return rng.next() < p;
}
