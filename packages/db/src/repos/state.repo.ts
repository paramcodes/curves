import type { StateId, TeamId } from "@curves/domain/core/ids";
import type { WorkflowState } from "@curves/domain/teams/workflow.types";
import { and, asc, eq } from "drizzle-orm";
import { states } from "../schema/states";
import type { Db } from "./issue.repo";

export type StateRow = typeof states.$inferSelect;

export interface WorkflowStateRepo {
  byId(id: StateId): Promise<WorkflowState | null>;
  /**
   * The team's workflow ordered by position; id breaks ties (position is NOT
   * unique — reorderable by design), so ordering is deterministic.
   */
  byTeam(teamId: TeamId): Promise<WorkflowState[]>;
  /**
   * The team's backlog state — lowest position among category "backlog",
   * mirroring rolloverPlan's backlog pick; null when the team has none.
   */
  backlogState(teamId: TeamId): Promise<WorkflowState | null>;
}

/** Read-only for Phase 1: states are created/edited by the workflow editor (Phase 5 task 1). */
export const createWorkflowStateRepo = (db: Db): WorkflowStateRepo => {
  const toDomain = (row: StateRow): WorkflowState => row;

  return {
    byId: async (id) => {
      const rows = await db.select().from(states).where(eq(states.id, id)).limit(1);
      const row = rows[0];
      return row === undefined ? null : toDomain(row);
    },

    byTeam: async (teamId) => {
      const rows = await db
        .select()
        .from(states)
        .where(eq(states.teamId, teamId))
        .orderBy(asc(states.position), asc(states.id));
      return rows.map(toDomain);
    },

    backlogState: async (teamId) => {
      const rows = await db
        .select()
        .from(states)
        .where(and(eq(states.teamId, teamId), eq(states.category, "backlog")))
        .orderBy(asc(states.position), asc(states.id))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toDomain(row);
    },
  };
};
