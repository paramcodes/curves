import type { LabelId, StateId, TeamId } from "../core/ids";

/** Category drives semantics everywhere (state machine, rollups, rollover). */
export type StateCategory = "backlog" | "unstarted" | "started" | "completed" | "canceled";

export interface WorkflowState {
  id: StateId;
  teamId: TeamId;
  name: string;
  category: StateCategory;
  position: number;
}

export interface Label {
  id: LabelId;
  teamId: TeamId;
  name: string;
  color: string;
}
