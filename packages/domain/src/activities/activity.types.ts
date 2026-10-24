import type { ActivityId, IssueId, ProjectId, UserId } from "../core/ids";

/** Written by every mutation from Phase 2 on. */
export type ActivityVerb =
  | "issue_created"
  | "title_changed"
  | "state_changed"
  | "assignee_changed"
  | "priority_changed"
  | "label_added"
  | "label_removed"
  | "moved_to_cycle"
  | "moved_to_project"
  | "commented"
  | "reaction_added";

export interface Activity {
  id: ActivityId;
  actorId: UserId;
  verb: ActivityVerb;
  entityType: "issue" | "project";
  entityId: IssueId | ProjectId;
  /** Per-verb zod shape; formatters snapshot-tested (Phase 6). */
  payload: unknown;
  at: Date;
}
