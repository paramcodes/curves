import type { TeamId, UserId, ViewId } from "../core/ids";
import type { DisplaySpec } from "./display.types";
import type { FilterSpec } from "./filter.types";

export interface View {
  id: ViewId;
  ownerId: UserId;
  /** null → a personal view, not scoped to a team. */
  teamId: TeamId | null;
  name: string;
  filter: FilterSpec;
  display: DisplaySpec;
  isTeamDefault: boolean;
}
