import { describe, expect, it } from "vitest";
import { fixedClock } from "../core/clock";
import { ValidationError } from "../core/errors";
import { cycleId, issueId, stateId, teamId, userId } from "../core/ids";
import type { Issue } from "../issues/issue.types";
import type { StateCategory, WorkflowState } from "../teams/workflow.types";
import type { Cycle } from "./cycle.types";
import { rolloverPlan } from "./rollover";

const T0 = fixedClock("2026-10-01T00:00:00Z").now();
const T1 = fixedClock("2026-10-14T00:00:00Z").now();

const state = (
  id: string,
  category: StateCategory,
  team = "team_eng",
  position = 0,
): WorkflowState => ({
  id: stateId(id),
  teamId: teamId(team),
  name: id,
  category,
  position,
});

const states: WorkflowState[] = [
  state("state_backlog", "backlog", "team_eng", 0),
  state("state_todo", "unstarted", "team_eng", 1),
  state("state_doing", "started", "team_eng", 2),
  state("state_done", "completed", "team_eng", 3),
  state("state_canceled", "canceled", "team_eng", 4),
];

const finished: Cycle = {
  id: cycleId("cycle_1"),
  teamId: teamId("team_eng"),
  number: 1,
  startsAt: T0,
  endsAt: T1,
};

const next: Cycle = { ...finished, id: cycleId("cycle_2"), number: 2 };

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
  cycleId: cycleId("cycle_1"),
  createdAt: T0,
  updatedAt: T0,
  startedAt: T0,
  completedAt: null,
  canceledAt: null,
  archivedAt: null,
  ...overrides,
});

const inCycle = (id: string, overrides: Partial<Issue> = {}): Issue =>
  makeIssue({ id: issueId(id), number: 1, ...overrides });

const moveIds = (plan: ReturnType<typeof rolloverPlan>): string[] =>
  plan.moves.map((m) => m.issueId);

describe("rolloverPlan", () => {
  it("moves only unfinished, unarchived issues of the finished cycle (next_cycle)", () => {
    const issues = [
      inCycle("i_moved"),
      inCycle("i_done", { stateId: stateId("state_done"), completedAt: T0 }),
      inCycle("i_canceled", { stateId: stateId("state_canceled"), canceledAt: T0 }),
      // canceled-then-reopened: the canceledAt stamp is sticky but the state is live — it moves
      inCycle("i_reopened", { canceledAt: T0 }),
      inCycle("i_archived", { archivedAt: T0 }),
      inCycle("i_other_cycle", { cycleId: cycleId("cycle_2") }),
      inCycle("i_no_cycle", { cycleId: null }),
    ];
    const plan = rolloverPlan(finished, next, issues, "next_cycle", states);
    expect(moveIds(plan)).toEqual(["i_moved", "i_reopened"]);
    expect(plan.moves[0]).toEqual({
      issueId: issueId("i_moved"),
      toCycleId: next.id,
      toStateId: null,
    });
  });

  it("next_cycle with a null next falls back to the backlog move", () => {
    const plan = rolloverPlan(finished, null, [inCycle("i_moved")], "next_cycle", states);
    expect(plan.moves[0]).toEqual({
      issueId: issueId("i_moved"),
      toCycleId: null,
      toStateId: stateId("state_backlog"),
    });
  });

  it("backlog policy strips the cycle and demotes to the team's backlog state", () => {
    const plan = rolloverPlan(finished, next, [inCycle("i_moved")], "backlog", states);
    expect(plan.moves[0]).toEqual({
      issueId: issueId("i_moved"),
      toCycleId: null,
      toStateId: stateId("state_backlog"),
    });
  });

  it("includes issues whose state cannot be resolved (must not strand work)", () => {
    const issues = [inCycle("i_ghost", { stateId: stateId("state_ghost") })];
    const plan = rolloverPlan(finished, next, issues, "next_cycle", states);
    expect(moveIds(plan)).toEqual(["i_ghost"]);
  });

  it("throws ValidationError naming the team when no backlog state exists", () => {
    const otherTeamStates = [state("other_doing", "started", "team_other")];
    const otherCycle: Cycle = { ...finished, teamId: teamId("team_other") };
    const issues = [inCycle("i_moved", { teamId: teamId("team_other") })];
    expect(() => rolloverPlan(otherCycle, null, issues, "backlog", otherTeamStates)).toThrowError(
      ValidationError,
    );
    try {
      rolloverPlan(otherCycle, null, issues, "backlog", otherTeamStates);
      expect.unreachable("missing backlog state should throw");
    } catch (error) {
      expect((error as ValidationError).code).toBe("invalid");
      expect((error as ValidationError).message).toContain("team_other");
    }
  });

  it("does not throw for an empty scope even without a backlog state", () => {
    const otherTeamStates = [state("other_doing", "started", "team_other")];
    const otherCycle: Cycle = { ...finished, teamId: teamId("team_other") };
    expect(rolloverPlan(otherCycle, null, [], "backlog", otherTeamStates)).toEqual({ moves: [] });
  });

  it("is deterministic: two calls produce deep-equal plans and never mutate inputs", () => {
    const issues = [
      inCycle("i_a"),
      inCycle("i_b", { stateId: stateId("state_backlog") }),
      inCycle("i_done", { stateId: stateId("state_done"), completedAt: T0 }),
    ];
    const snapshot = issues.map((issue) => ({ ...issue }));
    const plan1 = rolloverPlan(finished, next, issues, "next_cycle", states);
    const plan2 = rolloverPlan(finished, next, issues, "next_cycle", states);
    expect(plan1).toEqual(plan2);
    expect(plan1).not.toBe(plan2);
    expect(moveIds(plan1)).toEqual(["i_a", "i_b"]);
    expect(issues).toEqual(snapshot);
  });
});
