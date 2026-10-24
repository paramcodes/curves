export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
}

/** Deterministic mulberry32 RNG: same seed, same sequence — required for the deterministic seed and reproducible tests. */
export const seededRng = (seed: number): Rng => {
  let a = seed >>> 0;
  return {
    next: () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
};
