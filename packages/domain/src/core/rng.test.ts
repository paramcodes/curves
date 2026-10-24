import { describe, expect, it } from "vitest";
import { seededRng } from "./rng";

const firstN = (seed: number, n: number) => Array.from({ length: n }, () => seededRng(seed).next());

describe("seededRng (mulberry32)", () => {
  it("same seed produces the identical sequence", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const seqA = [a.next(), a.next(), a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it("different seeds diverge", () => {
    expect(firstN(1, 5)).not.toEqual(firstN(2, 5));
  });

  it("values stay in [0, 1)", () => {
    const rng = seededRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
