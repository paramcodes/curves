import { describe, expect, it } from "vitest";
import { fixedClock } from "../core/clock";
import { issueId, labelId, projectId, stateId, teamId, userId } from "../core/ids";
import type { Issue } from "../issues/issue.types";
import { evaluate } from "./evaluate";
import type { FilterSpec } from "./filter.types";

const T0 = fixedClock("2026-10-24T09:00:00Z").now();

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: issueId("issue_1"),
  teamId: teamId("team_eng"),
  number: 1,
  title: "Fix the curve",
  description: "",
  stateId: stateId("state_todo"),
  priority: 2,
  estimate: 5,
  assigneeId: userId("user_ada"),
  creatorId: userId("user_grace"),
  parentId: null,
  labelIds: [labelId("label_bug")],
  order: "a0" as Issue["order"],
  projectId: projectId("proj_apex"),
  milestoneId: null,
  cycleId: null,
  createdAt: T0,
  updatedAt: T0,
  startedAt: null,
  completedAt: null,
  canceledAt: null,
  archivedAt: null,
  ...overrides,
});

type Condition = Extract<FilterSpec, { kind: "cond" }>;

const cond = (
  key: Condition["key"],
  op: Condition["op"],
  value: Condition["value"],
): FilterSpec => ({
  kind: "cond",
  key,
  op,
  value,
});

const group = (op: "and" | "or", children: FilterSpec[]): FilterSpec => ({
  kind: "group",
  op,
  children,
});

describe("evaluate — conditions", () => {
  const issue = makeIssue();

  it("matches ids and scalars with eq", () => {
    expect(evaluate(cond("state", "eq", "state_todo"), issue)).toBe(true);
    expect(evaluate(cond("state", "eq", "state_done"), issue)).toBe(false);
    expect(evaluate(cond("priority", "eq", 2), issue)).toBe(true);
    expect(evaluate(cond("team", "eq", "team_eng"), issue)).toBe(true);
  });

  it("assignee eq null matches unassigned, neq null matches assigned", () => {
    expect(evaluate(cond("assignee", "eq", null), issue)).toBe(false);
    expect(evaluate(cond("assignee", "eq", null), makeIssue({ assigneeId: null }))).toBe(true);
    expect(evaluate(cond("assignee", "neq", null), issue)).toBe(true);
    expect(evaluate(cond("assignee", "neq", "user_ada"), issue)).toBe(false);
  });

  it("label: in intersects, nin requires no intersection, other ops are false", () => {
    expect(evaluate(cond("label", "in", ["label_bug", "label_x"]), issue)).toBe(true);
    expect(evaluate(cond("label", "in", ["label_x"]), issue)).toBe(false);
    expect(evaluate(cond("label", "nin", ["label_x"]), issue)).toBe(true);
    expect(evaluate(cond("label", "nin", ["label_bug"]), issue)).toBe(false);
    expect(evaluate(cond("label", "eq", "label_bug"), issue)).toBe(false);
    expect(evaluate(cond("label", "exists", null), issue)).toBe(true);
    expect(evaluate(cond("label", "exists", null), makeIssue({ labelIds: [] }))).toBe(false);
  });

  it("estimate ordering excludes null; exists distinguishes set from null", () => {
    expect(evaluate(cond("estimate", "gt", 3), issue)).toBe(true);
    expect(evaluate(cond("estimate", "gt", 5), issue)).toBe(false);
    expect(evaluate(cond("estimate", "lte", 5), issue)).toBe(true);
    expect(evaluate(cond("estimate", "gt", 3), makeIssue({ estimate: null }))).toBe(false);
    expect(evaluate(cond("estimate", "exists", null), issue)).toBe(true);
    expect(evaluate(cond("estimate", "exists", null), makeIssue({ estimate: null }))).toBe(false);
  });

  it("created/updated compare as epoch ms", () => {
    const ms = T0.getTime();
    expect(evaluate(cond("created", "gt", ms - 1), issue)).toBe(true);
    expect(evaluate(cond("created", "gt", ms), issue)).toBe(false);
    expect(evaluate(cond("created", "lte", ms), issue)).toBe(true);
    expect(evaluate(cond("updated", "lt", ms + 1000), issue)).toBe(true);
    // string value against a numeric epoch field is not comparable → false
    expect(evaluate(cond("created", "gt", "2026-10-24"), issue)).toBe(false);
  });

  it("in/nin on scalar fields require an array value", () => {
    expect(evaluate(cond("priority", "in", [0, 1, 2]), issue)).toBe(true);
    expect(evaluate(cond("priority", "in", [0, 1]), issue)).toBe(false);
    expect(evaluate(cond("priority", "nin", [0, 1]), issue)).toBe(true);
    expect(evaluate(cond("state", "in", "state_todo"), issue)).toBe(false);
    expect(evaluate(cond("state", "nin", "state_todo"), issue)).toBe(false);
  });
});

describe("evaluate — groups", () => {
  const issue = makeIssue();

  it("evaluates nested and/or mixes", () => {
    const spec = group("and", [
      cond("priority", "gte", 2),
      group("or", [cond("assignee", "eq", "user_nobody"), cond("state", "eq", "state_todo")]),
      cond("estimate", "exists", null),
    ]);
    expect(evaluate(spec, issue)).toBe(true);

    const failing = group("and", [
      cond("priority", "gte", 2),
      group("or", [cond("assignee", "eq", "user_nobody"), cond("state", "eq", "state_done")]),
    ]);
    expect(evaluate(failing, issue)).toBe(false);
  });

  it("empty and is true, empty or is false", () => {
    expect(evaluate(group("and", []), issue)).toBe(true);
    expect(evaluate(group("or", []), issue)).toBe(false);
  });
});
