import { describe, expect, expectTypeOf, it } from "vitest";
import { displaySchema, filterSchema, viewSchema } from "./filter.schema";
import type { View } from "./view.types";

const nestedSpec = {
  kind: "group",
  op: "and",
  children: [
    { kind: "cond", key: "state", op: "in", value: ["state_todo", "state_doing"] },
    {
      kind: "group",
      op: "or",
      children: [
        { kind: "cond", key: "assignee", op: "eq", value: "user_1" },
        { kind: "cond", key: "priority", op: "gte", value: 3 },
      ],
    },
    { kind: "cond", key: "label", op: "nin", value: ["label_wontfix"] },
  ],
} as const;

const sampleView = {
  id: "view_1",
  ownerId: "user_1",
  teamId: null,
  name: "My issues",
  filter: nestedSpec,
  display: { groupBy: "status", sortBy: "priority", direction: "desc", showSubIssues: false },
  isTeamDefault: false,
};

describe("filterSchema", () => {
  it("accepts a realistic nested spec, unchanged", () => {
    expect(filterSchema.parse(nestedSpec)).toEqual(nestedSpec);
  });

  it("accepts empty groups (evaluate defines their semantics)", () => {
    expect(filterSchema.parse({ kind: "group", op: "and", children: [] })).toEqual({
      kind: "group",
      op: "and",
      children: [],
    });
  });

  it("rejects an unknown kind", () => {
    expect(() => filterSchema.parse({ kind: "bogus", op: "and", children: [] })).toThrow();
  });

  it("rejects an unknown op", () => {
    expect(() =>
      filterSchema.parse({ kind: "cond", key: "state", op: "startswith", value: "x" }),
    ).toThrow();
  });

  it("rejects an unknown key", () => {
    expect(() =>
      filterSchema.parse({ kind: "cond", key: "velocity", op: "eq", value: 1 }),
    ).toThrow();
  });

  it("rejects a non-FilterValue (boolean)", () => {
    expect(() =>
      filterSchema.parse({ kind: "cond", key: "priority", op: "eq", value: true }),
    ).toThrow();
  });
});

describe("displaySchema", () => {
  it("accepts a display spec", () => {
    expect(
      displaySchema.parse({
        groupBy: "assignee",
        sortBy: "order",
        direction: "asc",
        showSubIssues: true,
      }),
    ).toEqual({ groupBy: "assignee", sortBy: "order", direction: "asc", showSubIssues: true });
  });

  it("rejects an unknown groupBy", () => {
    expect(() =>
      displaySchema.parse({
        groupBy: "mood",
        sortBy: "order",
        direction: "asc",
        showSubIssues: true,
      }),
    ).toThrow();
  });
});

describe("viewSchema", () => {
  it("round-trips a view and returns the View shape", () => {
    const parsed = viewSchema.parse(sampleView);
    expect(parsed).toEqual(sampleView);
    expectTypeOf(parsed).toEqualTypeOf<View>();
    expect(parsed.filter.kind).toBe("group");
    expect(parsed.display.groupBy).toBe("status");
  });

  it("brands the ids at the boundary", () => {
    const parsed = viewSchema.parse(sampleView);
    expect(parsed.id).toBe("view_1");
    expect(parsed.ownerId).toBe("user_1");
  });

  it("rejects a malformed view", () => {
    expect(() => viewSchema.parse({ ...sampleView, filter: { kind: "bogus" } })).toThrow();
  });
});
