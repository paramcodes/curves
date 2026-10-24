import { describe, expect, it } from "vitest";
import { fixedClock } from "./clock";

describe("fixedClock", () => {
  it("returns the fixed instant across calls", () => {
    const clock = fixedClock("2026-10-24T12:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-10-24T12:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-10-24T12:00:00.000Z");
  });

  it("accepts a Date and an ISO string identically", () => {
    const fromIso = fixedClock("2026-10-24T12:00:00.000Z");
    const fromDate = fixedClock(new Date("2026-10-24T12:00:00.000Z"));
    expect(fromIso.now().getTime()).toBe(fromDate.now().getTime());
  });

  it("mutating a returned Date does not affect the clock", () => {
    const clock = fixedClock("2026-10-24T12:00:00.000Z");
    clock.now().setFullYear(2000);
    expect(clock.now().toISOString()).toBe("2026-10-24T12:00:00.000Z");
  });
});
