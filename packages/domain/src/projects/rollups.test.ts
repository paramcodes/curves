import { describe, expect, it } from "vitest";
import { fixedClock } from "../core/clock";
import { issueId, stateId, teamId, userId } from "../core/ids";
import type { Issue } from "../issues/issue.types";
import type { StateCategory, WorkflowState } from "../teams/workflow.types";
import { cycleProgress, projectRollup } from "./rollups";

const T0 = fixedClock("2026-10-01T00:00:00Z").now();
const T1 = fixedClock("2026-10-10T00:00:00Z").now();

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: issueId("issue_1"),
  teamId: teamId("team_eng"),
  number: 1,
  title: "Fix the curve",
  description: "",
  stateId: stateId("state_doing"),
  priority: 0,
  estimate: null,
  assigneeId: null,
  creatorId: userId("user_1"),
  parentId: null,
  labelIds: [],
  order: "a0" as Issue["order"],
  projectId: null,
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

const state = (id: string, category: StateCategory): WorkflowState => ({
  id: stateId(id),
  teamId: teamId("team_eng"),
  name: id,
  category,
  position: 0,
});

describe("projectRollup", () => {
  it("sums non-null estimates only and counts done by completedAt stamp", () => {
    const issues = [
      makeIssue({ id: issueId("a"), estimate: 5, startedAt: T0, completedAt: T1 }),
      makeIssue({ id: issueId("b"), estimate: 3, startedAt: T0 }),
      makeIssue({ id: issueId("c"), estimate: null }),
      makeIssue({ id: issueId("d"), estimate: 100, canceledAt: T1 }),
    ];
    expect(projectRollup(issues)).toEqual({
      total: 3,
      done: 1,
      estimateTotal: 8,
      estimateDone: 5,
    });
  });

  it("counts a reopened-then-completed issue as done (stamp-based)", () => {
    const issues = [makeIssue({ startedAt: T0, completedAt: T1 })];
    expect(projectRollup(issues)).toEqual({
      total: 1,
      done: 1,
      estimateTotal: 0,
      estimateDone: 0,
    });
  });

  it("excludes canceled issues from every count", () => {
    const issues = [makeIssue({ canceledAt: T1, completedAt: T1, estimate: 7 })];
    expect(projectRollup(issues)).toEqual({ total: 0, done: 0, estimateTotal: 0, estimateDone: 0 });
  });
});

describe("cycleProgress", () => {
  const states = [state("state_doing", "started"), state("state_done", "completed")];

  it("counts done via state category and excludes canceled", () => {
    const issues = [
      makeIssue({ id: issueId("a"), stateId: stateId("state_done"), estimate: 5 }),
      makeIssue({ id: issueId("b"), stateId: stateId("state_doing"), estimate: 3 }),
      makeIssue({ id: issueId("c"), estimate: null }),
      makeIssue({
        id: issueId("d"),
        stateId: stateId("state_done"),
        estimate: 100,
        canceledAt: T1,
      }),
    ];
    expect(cycleProgress(issues, states)).toEqual({
      total: 3,
      done: 1,
      estimateTotal: 8,
      estimateDone: 5,
    });
  });

  it("treats an unresolvable state as not done, but still in scope", () => {
    const issues = [makeIssue({ stateId: stateId("state_ghost") })];
    expect(cycleProgress(issues, states)).toEqual({
      total: 1,
      done: 0,
      estimateTotal: 0,
      estimateDone: 0,
    });
  });
});
