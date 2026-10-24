import type { Clock } from "@curves/domain/core/clock";
import type { CycleId, TeamId } from "@curves/domain/core/ids";
import {
  type RolloverPlan,
  type RolloverPolicy,
  rolloverPlan,
} from "@curves/domain/cycles/rollover";
import type { Issue } from "@curves/domain/issues/issue.types";
import { eq } from "drizzle-orm";
import { createCycleRepo } from "../repos/cycle.repo";
import { toDomain } from "../repos/issue.mapper";
import { type Db, labelIdsFor } from "../repos/issue.repo";
import { createWorkflowStateRepo } from "../repos/state.repo";
import { issues } from "../schema/issues";

/** Transaction handle handed to db.transaction callbacks — inferred, not hand-written. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface CycleRolloverJob {
  /**
   * Moves the finished cycle's unfinished work per policy and reports what it
   * did: `moved` = moves actually applied, `rerunNoop` = moved === 0 (running
   * again changes nothing — the Phase 5 scheduler relies on this).
   */
  runCycleRollover(
    teamId: TeamId,
    policy: RolloverPolicy,
    clock: Clock,
  ): Promise<{
    moved: number;
    rerunNoop: boolean;
  }>;
}

/**
 * Applies planned moves inside the caller's transaction, returning how many
 * actually ran. Per-move idempotency guard (layer 2 in the doc block on
 * createCycleRolloverJob): the issue is re-read in-transaction and SKIPPED
 * when already at the target.
 */
const applyMoves = async (tx: Tx, moves: RolloverPlan["moves"], now: Date): Promise<number> => {
  let applied = 0;
  for (const move of moves) {
    const rows = await tx.select().from(issues).where(eq(issues.id, move.issueId)).limit(1);
    const row = rows[0];
    if (row === undefined) {
      continue; // deleted between plan and apply — nothing to move
    }
    const atTarget =
      row.cycleId === move.toCycleId && (move.toStateId === null || row.stateId === move.toStateId);
    if (atTarget) {
      continue;
    }
    await tx
      .update(issues)
      .set({
        cycleId: move.toCycleId,
        ...(move.toStateId !== null ? { stateId: move.toStateId } : {}),
        updatedAt: now,
      })
      .where(eq(issues.id, move.issueId));
    applied += 1;
  }
  return applied;
};

/**
 * Storage-side executor of the pure rolloverPlan() (CORE_MODEL §5): plan with
 * domain functions, apply transactionally, converge on rerun.
 *
 * Why here, why now: Phase 5 (docs/phases/05-projects-cycles-views.md, task 4)
 * schedules this job per team with the configured policy and demands that "a
 * crash mid-rollover must converge on rerun" (acceptance: "running it twice
 * yields identical data"). It lands in Phase 1 because the policy is the
 * Phase 1 domain function and the storage boundary it targets exists now;
 * PLAN.md defers formal verification of rollover idempotency to Phase 5-6 —
 * the contract suite is the interim proof.
 *
 * Idempotency, two layers:
 * 1. The plan is recomputed from CURRENT state — an issue moved by a previous
 *    (crashed) run is no longer in the finished cycle, so it is not re-planned.
 * 2. Each move re-reads its issue inside the apply transaction and is SKIPPED
 *    when already at the target — a defensive guard for the one window the
 *    fresh plan cannot see: a concurrent twin run committing between this
 *    run's reads and its transaction (single-connection pglite cannot produce
 *    it; real Postgres can).
 *
 * The clock is the single time source: `now` decides which cycle counts as
 * finished and stamps every moved issue's updatedAt.
 *
 * Phase 2 note: moves do not write "moved_to_cycle" activities here — payload
 * shapes are per-verb zod schemas owned by the API mutation layer, which will
 * call this job (or compose the same plan) and record them.
 */
export const createCycleRolloverJob = (db: Db): CycleRolloverJob => {
  const cycleRepo = createCycleRepo(db);
  const stateRepo = createWorkflowStateRepo(db);

  /** Full domain Issues of the finished cycle — the pure planner's input. */
  const cycleIssues = async (finishedCycleId: CycleId): Promise<Issue[]> => {
    const rows = await db.select().from(issues).where(eq(issues.cycleId, finishedCycleId));
    const labels = await labelIdsFor(
      db,
      rows.map((r) => r.id),
    );
    return rows.map((row) => toDomain(row, labels.get(row.id) ?? []));
  };

  return {
    runCycleRollover: async (teamId, policy, clock) => {
      const now = clock.now();

      const finished = await cycleRepo.latestEndedBefore(teamId, now);
      if (finished === null) {
        // nothing has ended — a rerun still changes nothing
        return { moved: 0, rerunNoop: true };
      }
      const next = await cycleRepo.nextAfter(teamId, finished.endsAt);
      const states = await stateRepo.byTeam(teamId);
      const plan = rolloverPlan(finished, next, await cycleIssues(finished.id), policy, states);

      const moved = await db.transaction((tx) => applyMoves(tx, plan.moves, now));
      return { moved, rerunNoop: moved === 0 };
    },
  };
};
