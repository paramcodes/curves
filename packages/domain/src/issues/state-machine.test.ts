import { describe, expect, expectTypeOf, it } from "vitest";
import { fixedClock } from "../core/clock";
import { TransitionNotAllowedError, ValidationError } from "../core/errors";
import { issueId, stateId, teamId, userId } from "../core/ids";
import type { StateCategory, WorkflowState } from "../teams/workflow.types";
import type { Issue } from "./issue.types";
import { allowedTransitions, applyTransition, canTransition } from "./state-machine";

const T0 = fixedClock("2026-10-24T09:00:00Z").now();
const T1 = fixedClock("2026-10-24T10:00:00Z").now();

const state = (category: StateCategory, id = `state_${category}`): WorkflowState => ({
  id: stateId(id),
  teamId: teamId("team_eng"),
  name: category,
  category,
  position: 0,
});

const makeIssue = (overrides: Partial<Issue> = {}): Issue => ({
  id: issueId("issue_1"),
  teamId: teamId("team_eng"),
  number: 1,
  title: "Fix the curve",
  description: "",
  stateId: stateId("state_backlog"),
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

/** An issue that has been everywhere: all stamps set, so stickiness is observable. */
const stamped = (stateIdValue: string) =>
  makeIssue({
    stateId: stateId(stateIdValue),
    startedAt: T0,
    completedAt: T0,
    canceledAt: T0,
  });

describe("allowedTransitions", () => {
  it("matches the spec table", () => {
    expect(allowedTransitions).toEqual({
      backlog: ["unstarted", "canceled"],
      unstarted: ["started", "backlog", "canceled"],
      started: ["completed", "canceled", "unstarted"],
      completed: ["started"],
      canceled: ["unstarted"],
    });
  });

  it("never allows same-category transitions", () => {
    const categories = Object.keys(allowedTransitions) as StateCategory[];
    for (const c of categories) {
      expect(canTransition(c, c)).toBe(false);
    }
  });

  it("agrees with canTransition for every pair", () => {
    const categories = Object.keys(allowedTransitions) as StateCategory[];
    for (const from of categories) {
      for (const to of categories) {
        expect(canTransition(from, to)).toBe(allowedTransitions[from].includes(to));
      }
    }
  });
});

describe("applyTransition — legal pairs", () => {
  /** Expected result stamps for every target category, given the pre-transition issue. */
  const expectedStamps = (to: StateCategory, issue: Issue): Partial<Issue> => {
    if (to === "started") {
      return { startedAt: T1, completedAt: null, canceledAt: issue.canceledAt };
    }
    if (to === "completed") {
      return {
        startedAt: issue.startedAt,
        completedAt: T1,
        canceledAt: issue.canceledAt,
      };
    }
    if (to === "canceled") {
      return {
        startedAt: issue.startedAt,
        completedAt: issue.completedAt,
        canceledAt: T1,
      };
    }
    return {
      startedAt: issue.startedAt,
      completedAt: issue.completedAt,
      canceledAt: issue.canceledAt,
    };
  };

  it("applies every legal pair with the right stamps", () => {
    const cases: Array<[StateCategory, StateCategory]> = [];
    for (const [from, tos] of Object.entries(allowedTransitions)) {
      for (const to of tos) {
        cases.push([from as StateCategory, to]);
      }
    }
    expect(cases.length).toBe(10);

    for (const [fromCategory, toCategory] of cases) {
      const from = state(fromCategory);
      const to = state(toCategory);
      const issue = stamped(`state_${fromCategory}`);
      const result = applyTransition(issue, from, to, T1);

      expect(result.stateId).toBe(to.id);
      expect(result.updatedAt).toEqual(T1);
      const stamps = expectedStamps(toCategory, issue);
      expect(result.startedAt).toEqual(stamps.startedAt);
      expect(result.completedAt).toEqual(stamps.completedAt);
      expect(result.canceledAt).toEqual(stamps.canceledAt);
    }
  });

  it("reopens a completed issue: completedAt cleared, fresh startedAt", () => {
    const issue = stamped("state_completed");
    const result = applyTransition(issue, state("completed"), state("started"), T1);
    expect(result.completedAt).toBeNull();
    expect(result.startedAt).toEqual(T1);
    // canceledAt stamp is sticky — entering "started" only clears completedAt
    expect(result.canceledAt).toEqual(T0);
  });

  it("demotes started -> unstarted keeping startedAt sticky", () => {
    const issue = stamped("state_started");
    const result = applyTransition(issue, state("started"), state("unstarted"), T1);
    expect(result.startedAt).toEqual(T0);
    expect(result.completedAt).toEqual(T0);
    expect(result.canceledAt).toEqual(T0);
  });
});

describe("applyTransition — rejections", () => {
  const illegal: Array<[StateCategory, StateCategory]> = [
    ["completed", "unstarted"],
    ["canceled", "completed"],
    ["started", "backlog"],
  ];

  it("throws TransitionNotAllowedError for illegal pairs", () => {
    for (const [fromCategory, toCategory] of illegal) {
      const issue = stamped(`state_${fromCategory}`);
      expect(() => applyTransition(issue, state(fromCategory), state(toCategory), T1)).toThrowError(
        TransitionNotAllowedError,
      );
      try {
        applyTransition(issue, state(fromCategory), state(toCategory), T1);
        expect.unreachable(`${fromCategory} -> ${toCategory} should throw`);
      } catch (error) {
        expect((error as TransitionNotAllowedError).code).toBe("transition_not_allowed");
      }
    }
  });

  it("throws TransitionNotAllowedError for same-state", () => {
    const issue = stamped("state_started");
    expect(() => applyTransition(issue, state("started"), state("started"), T1)).toThrowError(
      TransitionNotAllowedError,
    );
  });

  it("throws ValidationError on team mismatch", () => {
    const issue = stamped("state_backlog");
    const otherTeam = { ...state("unstarted"), teamId: teamId("team_other") };
    expect(() => applyTransition(issue, state("backlog"), otherTeam, T1)).toThrowError(
      ValidationError,
    );
    try {
      applyTransition(issue, state("backlog"), otherTeam, T1);
      expect.unreachable("team mismatch should throw");
    } catch (error) {
      expect((error as ValidationError).code).toBe("invalid");
    }
  });

  it("throws ValidationError on stale from-state", () => {
    const issue = stamped("state_backlog");
    expect(() => applyTransition(issue, state("started"), state("completed"), T1)).toThrowError(
      ValidationError,
    );
    try {
      applyTransition(issue, state("started"), state("completed"), T1);
      expect.unreachable("stale from-state should throw");
    } catch (error) {
      expect((error as ValidationError).code).toBe("invalid");
    }
  });
});

describe("applyTransition — purity", () => {
  /** Deep copy with fresh Dates (no structuredClone in the ES2023-only lib). */
  const snapshotOf = (issue: Issue): Issue => ({
    ...issue,
    labelIds: [...issue.labelIds],
    createdAt: new Date(issue.createdAt.getTime()),
    updatedAt: new Date(issue.updatedAt.getTime()),
    startedAt: issue.startedAt && new Date(issue.startedAt.getTime()),
    completedAt: issue.completedAt && new Date(issue.completedAt.getTime()),
    canceledAt: issue.canceledAt && new Date(issue.canceledAt.getTime()),
    archivedAt: issue.archivedAt && new Date(issue.archivedAt.getTime()),
  });

  it("never mutates the input issue", () => {
    const issue = stamped("state_started");
    const snapshot = snapshotOf(issue);
    applyTransition(issue, state("started"), state("completed"), T1);
    expect(issue).toEqual(snapshot);
  });

  it("returns a distinct object", () => {
    const issue = stamped("state_started");
    const result = applyTransition(issue, state("started"), state("completed"), T1);
    expect(result).not.toBe(issue);
  });
});

describe("typing", () => {
  it("keeps the table keyed by every category", () => {
    expectTypeOf(allowedTransitions).toEqualTypeOf<
      Record<StateCategory, readonly StateCategory[]>
    >();
  });
});
