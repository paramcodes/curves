import { ValidationError } from "../core/errors";
import type { CycleId, IssueId, StateId } from "../core/ids";
import type { Issue } from "../issues/issue.types";
import type { WorkflowState } from "../teams/workflow.types";
import type { Cycle } from "./cycle.types";

export type RolloverPolicy = "next_cycle" | "backlog";

export interface RolloverPlan {
  moves: Array<{
    issueId: IssueId;
    toCycleId: CycleId | null;
    toStateId: StateId | null;
  }>;
}

/**
 * Pure rollover planner — the job in packages/db executes the plan idempotently;
 * this function never performs it.
 *
 * Scope: issues of the finished cycle (cycleId === finished.id) that are not
 * archived (archivedAt === null) and whose state category — resolved via
 * `states` by id — is neither completed nor canceled. An issue whose state id
 * has no matching WorkflowState is treated as unfinished and moves (a missing
 * state record must not silently strand work in a finished cycle).
 *
 * Policies:
 * - next_cycle: every move targets next.id with toStateId null (states carry
 *   over unchanged). With next === null it falls back to the backlog move.
 * - backlog: toCycleId null and toStateId set to the finished team's backlog
 *   WorkflowState (lowest position when several exist). No backlog state for
 *   the team → ValidationError naming the team.
 *
 * Deterministic: same inputs produce deep-equal plans; issue order is preserved.
 */
export function rolloverPlan(
  finished: Cycle,
  next: Cycle | null,
  issues: readonly Issue[],
  policy: RolloverPolicy,
  states: readonly WorkflowState[],
): RolloverPlan {
  const backlogState = states
    .filter((s) => s.teamId === finished.teamId && s.category === "backlog")
    .sort((a, b) => a.position - b.position)[0];

  const backlogMove = (): { toCycleId: CycleId | null; toStateId: StateId } => {
    if (backlogState === undefined) {
      throw new ValidationError(
        `no backlog workflow state for team ${finished.teamId}; cannot roll over cycle ${finished.id} to backlog`,
      );
    }
    return { toCycleId: null, toStateId: backlogState.id };
  };

  const moves = issues
    .filter((issue) => issue.cycleId === finished.id && issue.archivedAt === null)
    .filter((issue) => {
      const category = states.find((s) => s.id === issue.stateId)?.category;
      return category !== "completed" && category !== "canceled";
    })
    .map((issue): RolloverPlan["moves"][number] => {
      if (policy === "next_cycle" && next !== null) {
        return { issueId: issue.id, toCycleId: next.id, toStateId: null };
      }
      return { issueId: issue.id, ...backlogMove() };
    });

  return { moves };
}
