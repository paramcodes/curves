export interface Clock {
  now(): Date;
}

/** Fixed clock for tests and the deterministic seed. Each call returns a fresh Date at the same instant, so callers cannot mutate shared state. */
export const fixedClock = (at: Date | string): Clock => {
  const instant = at instanceof Date ? at.getTime() : Date.parse(at);
  return { now: () => new Date(instant) };
};
