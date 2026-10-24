import { describe, expect, it } from "vitest";
import { cycleId, teamId } from "../core/ids";
import type { Cycle } from "./cycle.types";
import { classifyCycle } from "./cycle-math";

const cycle: Cycle = {
  id: cycleId("cycle_42"),
  teamId: teamId("team_eng"),
  number: 42,
  startsAt: new Date("2026-10-01T00:00:00Z"),
  endsAt: new Date("2026-10-15T00:00:00Z"),
};

describe("classifyCycle", () => {
  it("is upcoming the day before startsAt", () => {
    expect(classifyCycle(cycle, new Date("2026-09-30T23:59:59Z"))).toBe("upcoming");
  });

  it("is current exactly at startsAt (inclusive)", () => {
    expect(classifyCycle(cycle, new Date("2026-10-01T00:00:00Z"))).toBe("current");
  });

  it("is current inside the window", () => {
    expect(classifyCycle(cycle, new Date("2026-10-08T12:00:00Z"))).toBe("current");
  });

  it("is past exactly at endsAt (exclusive — the moment endsAt is reached it is past)", () => {
    expect(classifyCycle(cycle, new Date("2026-10-15T00:00:00Z"))).toBe("past");
  });

  it("is past after endsAt", () => {
    expect(classifyCycle(cycle, new Date("2026-10-20T00:00:00Z"))).toBe("past");
  });
});
