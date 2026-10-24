import type {
  CycleId,
  IssueId,
  LabelId,
  MilestoneId,
  ProjectId,
  StateId,
  TeamId,
  UserId,
} from "@curves/domain/core/ids";
import type { Issue, OrderKey, Priority } from "@curves/domain/issues/issue.types";
import type { issues } from "../schema/issues";

/** Drizzle row type for the issues table — never leaves this package. */
export type IssueRow = typeof issues.$inferSelect;

/**
 * Row → domain Issue. Labels are resolved by the caller (batched per page —
 * the repo never does a labels query per row); timestamps come back from
 * drizzle as Date already. Branded columns carry their brands through.
 */
export const toDomain = (row: IssueRow, labelIds: LabelId[]): Issue => ({
  id: row.id,
  teamId: row.teamId,
  number: row.number,
  title: row.title,
  description: row.description,
  stateId: row.stateId,
  priority: row.priority,
  estimate: row.estimate,
  assigneeId: row.assigneeId,
  creatorId: row.creatorId,
  parentId: row.parentId,
  labelIds,
  // same string serialization as domain orderKey() — a cast, not a transform
  order: row.order,
  projectId: row.projectId,
  milestoneId: row.milestoneId,
  cycleId: row.cycleId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
  canceledAt: row.canceledAt,
  archivedAt: row.archivedAt,
});

/** Create-time values (create-value helpers). */
export interface IssueCreateValues {
  id: IssueId;
  teamId: TeamId;
  number: number;
  title: string;
  description: string;
  stateId: StateId;
  priority: Priority;
  estimate: number | null;
  assigneeId: UserId | null;
  creatorId: UserId;
  parentId: IssueId | null;
  order: OrderKey;
  projectId: ProjectId | null;
  milestoneId: MilestoneId | null;
  cycleId: CycleId | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
  archivedAt: Date | null;
}

/**
 * Values for the issues insert from CreateIssueInput. A new issue starts in
 * the exact state its input describes: created == updated, and the lifecycle
 * stamps (started/completed/canceled/archived) are null — the state machine
 * stamps them on transitions, not at creation.
 */
export const createValues = (
  input: {
    teamId: TeamId;
    title: string;
    description: string;
    stateId: StateId;
    priority: Priority;
    estimate: number | null;
    assigneeId: UserId | null;
    creatorId: UserId;
    parentId: IssueId | null;
    projectId: ProjectId | null;
    milestoneId: MilestoneId | null;
    cycleId: CycleId | null;
    createdAt: Date;
  },
  id: IssueId,
  number: number,
  order: OrderKey,
): IssueCreateValues => ({
  id,
  teamId: input.teamId,
  number,
  title: input.title,
  description: input.description,
  stateId: input.stateId,
  priority: input.priority,
  estimate: input.estimate,
  assigneeId: input.assigneeId,
  creatorId: input.creatorId,
  parentId: input.parentId,
  order,
  projectId: input.projectId,
  milestoneId: input.milestoneId,
  cycleId: input.cycleId,
  createdAt: input.createdAt,
  updatedAt: input.createdAt,
  startedAt: null,
  completedAt: null,
  canceledAt: null,
  archivedAt: null,
});
