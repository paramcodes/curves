import { describe, expect, it } from "vitest";
import { ValidationError } from "../core/errors";
import type { OrderKey } from "./issue.types";
import { needsRebalance, orderBetween, orderKey, orderKeyNumber, rebalance } from "./ordering";

const k = (n: number): OrderKey => orderKey(n);

describe("orderKey / orderKeyNumber", () => {
  it("round-trips a double exactly", () => {
    for (const n of [0, 1, 42, -3, 0.15, 1e-15, 123456.789]) {
      expect(orderKeyNumber(orderKey(n))).toBe(n);
    }
    expect(orderKey(42)).toBe("42");
  });

  it("throws ValidationError on garbage keys", () => {
    for (const garbage of ["abc", "", "  ", "1.2.3", "Infinity"]) {
      expect(() => orderKeyNumber(garbage as OrderKey)).toThrowError(ValidationError);
      try {
        orderKeyNumber(garbage as OrderKey);
        expect.unreachable(`${JSON.stringify(garbage)} should throw`);
      } catch (error) {
        expect((error as ValidationError).code).toBe("invalid");
      }
    }
  });

  it("throws ValidationError on non-finite numbers", () => {
    expect(() => orderKey(Number.NaN)).toThrowError(ValidationError);
    expect(() => orderKey(Number.POSITIVE_INFINITY)).toThrowError(ValidationError);
  });
});

describe("orderBetween", () => {
  it("both null → base key 0", () => {
    expect(orderBetween(null, null)).toBe("0");
  });

  it("prev only → prev + 1 (append)", () => {
    expect(orderBetween(k(5), null)).toBe("6");
  });

  it("next only → next − 1 (prepend)", () => {
    expect(orderBetween(null, k(5))).toBe("4");
  });

  it("both → midpoint", () => {
    expect(orderBetween(k(3), k(5))).toBe("4");
    expect(orderBetween(k(1), k(2))).toBe("1.5");
    // float midpoints are compared numerically, not by string shape
    expect(orderKeyNumber(orderBetween(k(0.1), k(0.2)))).toBeCloseTo(0.15, 12);
  });

  it("colliding endpoints signal by returning prev unchanged", () => {
    expect(orderBetween(k(4), k(4))).toBe("4");
    expect(orderBetween(k(0), k(Number.MIN_VALUE))).toBe("0");
  });

  it("signals after ~52 repeated insertions against a fixed hi of 1e-15", () => {
    const hi = k(1e-15);
    let prev = k(0);
    let signaled = false;
    for (let i = 0; i < 60; i++) {
      const key = orderBetween(prev, hi);
      if (key === prev) {
        signaled = true;
        break;
      }
      prev = key;
    }
    expect(signaled).toBe(true);
  });
});

describe("needsRebalance", () => {
  it("is false for healthy spacing", () => {
    expect(needsRebalance([k(0), k(1), k(2)])).toBe(false);
    expect(needsRebalance([])).toBe(false);
    expect(needsRebalance([k(7)])).toBe(false);
  });

  it("is true on duplicates", () => {
    expect(needsRebalance([k(1), k(1)])).toBe(true);
    expect(needsRebalance([k(0), k(2), k(2), k(5)])).toBe(true);
  });

  it("is true when an adjacent gap drops below 1e-6", () => {
    expect(needsRebalance([k(1), k(1 + 1e-7)])).toBe(true);
    expect(needsRebalance([k(1), k(1 + 1e-5)])).toBe(false);
  });

  it("sorts numerically on a copy without mutating the input", () => {
    const input = [k(2), k(0), k(1)];
    const snapshot = [...input];
    expect(needsRebalance(input)).toBe(false);
    expect(input).toEqual(snapshot);
  });
});

describe("rebalance", () => {
  it("spreads count keys evenly with gaps of exactly 1", () => {
    const keys = rebalance(5);
    expect(keys).toEqual(["0", "1", "2", "3", "4"]);
    const nums = keys.map(orderKeyNumber);
    let prev: number | undefined;
    for (const n of nums) {
      if (prev !== undefined) {
        expect(n - prev).toBe(1);
      }
      prev = n;
    }
    expect(needsRebalance(keys)).toBe(false);
  });

  it("returns empty for count <= 0", () => {
    expect(rebalance(0)).toEqual([]);
    expect(rebalance(-3)).toEqual([]);
  });
});

describe("determinism", () => {
  it("same calls produce deep-equal results", () => {
    expect(orderBetween(k(3), k(5))).toEqual(orderBetween(k(3), k(5)));
    expect(needsRebalance([k(1), k(1)])).toEqual(needsRebalance([k(1), k(1)]));
    expect(rebalance(5)).toEqual(rebalance(5));
  });
});
