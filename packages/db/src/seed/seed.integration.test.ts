import { fixedClock } from "@curves/domain/core/clock";
import type { FilterSpec } from "@curves/domain/filters/filter.types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { issues } from "../schema/issues";
import { views } from "../schema/views";
import { createSharedTestDb } from "../test-db";
import { runSeed, type SeedSummary } from "./seed";

/** The anchor db:reset uses — the seed must be a pure function of it. */
const ANCHOR = fixedClock("2026-10-24T09:00:00Z");

const EXPECTED_SUMMARY: SeedSummary = {
  users: 4,
  teams: 2,
  states: 9,
  labels: 6,
  issues: 58,
  projectIssues: 8,
  cycles: 2,
  cycleIssues: 12,
  comments: 10,
  activities: 15,
  views: 2,
};

// One shared pglite per FILE (phase-1 exit S5): WASM init + migrations run
// once; each seed run truncates first instead of building a fresh database.
let shared: Awaited<ReturnType<typeof createSharedTestDb>>;

beforeAll(async () => {
  shared = await createSharedTestDb();
});
afterAll(async () => {
  await shared.close();
});

/**
 * Full issue rows — deep equality across two runs is the determinism proof.
 * Each run is reset → seed → snapshot on the shared instance: the original
 * proof compared two freshly migrated databases; a full TRUNCATE (all tables,
 * RESTART IDENTITY) leaves the same bare state, so one WASM replaces two.
 */
const runOnce = async (): Promise<{
  summary: SeedSummary;
  issueRows: Array<typeof issues.$inferSelect>;
  viewRows: Array<typeof views.$inferSelect>;
}> => {
  await shared.reset();
  const summary = await runSeed(shared.db, ANCHOR);
  const issueRows = await shared.db.select().from(issues);
  const viewRows = await shared.db.select().from(views);
  return { summary, issueRows, viewRows };
};

describe("deterministic seed", () => {
  it("two seed runs produce identical summaries and byte-identical issue rows", async () => {
    const first = await runOnce();
    const second = await runOnce();
    // counts match the summary exactly — 50 ENG + 8 DES, not a near-miss
    expect(first.summary).toEqual(EXPECTED_SUMMARY);
    expect(second.summary).toEqual(EXPECTED_SUMMARY);
    // ids, numbers, titles, order keys (and every other column) identical
    expect(second.issueRows).toEqual(first.issueRows);
  });

  it("numbers follow the per-team sequence (ADR 0006) and order keys accumulate 0..n", async () => {
    const { issueRows } = await runOnce();
    const eng = issueRows
      .filter((r) => r.teamId === "team_eng")
      .sort((a, b) => a.number - b.number);
    const des = issueRows
      .filter((r) => r.teamId === "team_des")
      .sort((a, b) => a.number - b.number);
    expect(eng.map((r) => r.number)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(des.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // orderBetween(prev, null) appends — serialized integer keys per team
    expect(eng.map((r) => r.order)).toEqual(Array.from({ length: 50 }, (_, i) => String(i)));
    expect(des.map((r) => r.order)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7"]);
  });

  it("the nested personal view and the team default round-trip through jsonb", async () => {
    const { viewRows } = await runOnce();
    const urgent = viewRows.find((v) => v.id === "view_ar_urgent");
    expect(urgent?.teamId).toBeNull(); // personal, not team-scoped
    expect(urgent?.isTeamDefault).toBe(false);
    const expectedFilter: FilterSpec = {
      kind: "group",
      op: "and",
      children: [
        {
          kind: "group",
          op: "or",
          children: [
            { kind: "cond", key: "priority", op: "eq", value: 4 },
            { kind: "cond", key: "label", op: "in", value: ["label_eng_bug"] },
          ],
        },
        { kind: "cond", key: "state", op: "nin", value: ["state_eng_done", "state_eng_canceled"] },
      ],
    };
    expect(urgent?.filter).toEqual(expectedFilter);

    const inbox = viewRows.find((v) => v.id === "view_eng_default");
    expect(inbox?.teamId).toBe("team_eng");
    expect(inbox?.isTeamDefault).toBe(true);
  });
});
