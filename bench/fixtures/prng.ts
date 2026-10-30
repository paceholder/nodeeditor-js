/** Seeded pseudo-random numbers (PERF-01): the same seed gives the same sequence. */

export interface Prng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Uniform pick from a non-empty list. */
  pick<T>(items: readonly T[]): T;
}

/** mulberry32: small, fast, and good enough for fixture layout. */
export function createPrng(seed: number): Prng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
    pick(items) {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error("pick from an empty list");
      return item;
    },
  };
}
