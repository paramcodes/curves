import type { Cycle } from "./cycle.types";

export type CyclePhase = "upcoming" | "current" | "past";

/**
 * Boundary semantics: startsAt is INCLUSIVE, endsAt is EXCLUSIVE — the moment
 * a cycle's endsAt is reached it is past. `[startsAt, endsAt)` is current.
 */
export const classifyCycle = (c: Cycle, now: Date): CyclePhase => {
  const t = now.getTime();
  if (t < c.startsAt.getTime()) {
    return "upcoming";
  }
  if (t >= c.endsAt.getTime()) {
    return "past";
  }
  return "current";
};
