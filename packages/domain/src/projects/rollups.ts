import type { Issue } from "../issues/issue.types";
import type { WorkflowState } from "../teams/workflow.types";

export interface ProjectRollup {
  total: number;
  done: number;
  estimateTotal: number;
  estimateDone: number;
}

/**
 * Canceled issues are excluded from every count in both rollups: canceled work
 * did not happen, so keeping it in `total` would let scope-creep flatter the
 * done ratio (removing scope makes progress look better than it is).
 */

/** Stamp-based rollup — no states needed; done means completedAt !== null. */
export const projectRollup = (issues: readonly Issue[]): ProjectRollup => {
  const live = issues.filter((issue) => issue.canceledAt === null);
  const done = live.filter((issue) => issue.completedAt !== null);
  return {
    total: live.length,
    done: done.length,
    estimateTotal: sumEstimates(live),
    estimateDone: sumEstimates(done),
  };
};

/** Category-based rollup for a cycle — done means the issue's state resolves to category "completed". */
export const cycleProgress = (
  issues: readonly Issue[],
  states: readonly WorkflowState[],
): ProjectRollup => {
  const live = issues.filter((issue) => issue.canceledAt === null);
  const done = live.filter(
    (issue) => states.find((s) => s.id === issue.stateId)?.category === "completed",
  );
  return {
    total: live.length,
    done: done.length,
    estimateTotal: sumEstimates(live),
    estimateDone: sumEstimates(done),
  };
};

const sumEstimates = (issues: readonly Issue[]): number =>
  issues.reduce((sum, issue) => sum + (issue.estimate ?? 0), 0);
