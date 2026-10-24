import { TransitionNotAllowedError, ValidationError } from "../core/errors";
import type { StateCategory, WorkflowState } from "../teams/workflow.types";
import type { Issue } from "./issue.types";

/**
 * The single source of truth for category-level transitions.
 * backlog/unstarted are holding pens; completed and canceled can only be left
 * by re-entering "started" (reopen) / "unstarted" (restore).
 */
export const allowedTransitions: Record<StateCategory, readonly StateCategory[]> = {
  backlog: ["unstarted", "canceled"],
  unstarted: ["started", "backlog", "canceled"],
  started: ["completed", "canceled", "unstarted"],
  completed: ["started"],
  canceled: ["unstarted"],
};

/** Same-category is never a transition. */
export const canTransition = (from: StateCategory, to: StateCategory): boolean =>
  from !== to && allowedTransitions[from].includes(to);

/**
 * Applies a category transition, stamping lifecycle timestamps.
 *
 * Deviation from CORE_MODEL section 4: this takes explicit `from` and `to`
 * WorkflowStates instead of a target state alone — the category lives on
 * WorkflowState, not on Issue, so the caller must supply the issue's current
 * state for validation.
 *
 * Stamp stickiness rule: stamps are sticky. Transitions into backlog/unstarted
 * never clear existing stamps (a demoted issue keeps its history). The only
 * clearing transition is re-entering "started", which resets completedAt so a
 * reopened issue can complete again with a fresh completedAt.
 *
 * Pure: returns a new Issue; the input is never mutated.
 */
export function applyTransition(
  issue: Issue,
  from: WorkflowState,
  to: WorkflowState,
  now: Date,
): Issue {
  if (from.teamId !== to.teamId) {
    throw new ValidationError(
      `cannot move issue across teams (from ${from.teamId} to ${to.teamId})`,
    );
  }
  if (from.id !== issue.stateId) {
    throw new ValidationError(`stale from-state: issue is in ${issue.stateId}, got ${from.id}`);
  }
  if (!canTransition(from.category, to.category)) {
    throw new TransitionNotAllowedError(`illegal transition ${from.category} -> ${to.category}`);
  }

  let startedAt = issue.startedAt;
  let completedAt = issue.completedAt;
  let canceledAt = issue.canceledAt;
  if (to.category === "started") {
    startedAt = now;
    completedAt = null;
  } else if (to.category === "completed") {
    completedAt = now;
  } else if (to.category === "canceled") {
    canceledAt = now;
  }

  return {
    ...issue,
    stateId: to.id,
    startedAt,
    completedAt,
    canceledAt,
    updatedAt: now,
  };
}
