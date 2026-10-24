import { ValidationError } from "../core/errors";
import type { OrderKey } from "./issue.types";

/**
 * Fractional ordering per ADR 0005: an OrderKey is the serialization of a
 * finite double (via String(x)); the string form is opaque to callers and
 * compared numerically after parsing.
 */

/** Serialization for the repo layer. Throws on non-finite numbers. */
export const orderKey = (n: number): OrderKey => {
  if (!Number.isFinite(n)) {
    throw new ValidationError(`order key must be a finite number, got ${n}`);
  }
  return String(n) as OrderKey;
};

/** Parsing for the repo layer. Throws on garbage (non-numeric, empty, non-finite). */
export const orderKeyNumber = (k: OrderKey): number => {
  const n = Number(k);
  if (k.trim() === "" || !Number.isFinite(n)) {
    throw new ValidationError(`malformed order key: "${k}"`);
  }
  return n;
};

/**
 * Returns a key strictly between prev and next.
 * - both null → base key 0
 * - prev only → prev + 1 (append)
 * - next only → next − 1 (prepend)
 * - both → midpoint (prev + next) / 2
 *
 * Collision signal: when the midpoint collides with an endpoint (mid <= prev
 * or mid >= next — double precision exhausted), the result equals prev
 * unchanged. Callers must treat that as "cannot split here" and run
 * needsRebalance/rebalance.
 */
export const orderBetween = (prev: OrderKey | null, next: OrderKey | null): OrderKey => {
  if (prev === null && next === null) {
    return orderKey(0);
  }
  if (next === null) {
    // prev cannot be null here (both-null handled above); the guard satisfies narrowing
    if (prev === null) {
      return orderKey(0);
    }
    return orderKey(orderKeyNumber(prev) + 1);
  }
  if (prev === null) {
    return orderKey(orderKeyNumber(next) - 1);
  }
  const lo = orderKeyNumber(prev);
  const hi = orderKeyNumber(next);
  const mid = (lo + hi) / 2;
  if (mid <= lo || mid >= hi) {
    return prev;
  }
  return orderKey(mid);
};

/**
 * True when the keys (sorted numerically on a copy — the input is never
 * mutated) contain duplicates or any adjacent gap below 1e-6.
 */
export const needsRebalance = (keys: readonly OrderKey[]): boolean => {
  const sorted = keys.map(orderKeyNumber).sort((a, b) => a - b);
  let prev: number | undefined;
  for (const n of sorted) {
    if (prev !== undefined && (n === prev || n - prev < 1e-6)) {
      return true;
    }
    prev = n;
  }
  return false;
};

/** Even integer spacing over [0, count): keys 0, 1, …, count − 1. count <= 0 → empty. */
export const rebalance = (count: number): OrderKey[] => {
  if (count <= 0) {
    return [];
  }
  return Array.from({ length: count }, (_, i) => orderKey(i));
};
