import type { CycleId, TeamId } from "../core/ids";

export interface Cycle {
  id: CycleId;
  teamId: TeamId;
  number: number;
  startsAt: Date;
  endsAt: Date;
}
