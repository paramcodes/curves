import type { Brand } from "../core/brand";
import type {
  CycleId,
  IssueId,
  LabelId,
  MilestoneId,
  ProjectId,
  StateId,
  TeamId,
  UserId,
} from "../core/ids";

/** none, low, medium, high, urgent */
export type Priority = 0 | 1 | 2 | 3 | 4;

export const PRIORITY_NAME: Record<Priority, string> = {
  0: "No priority",
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

/** Fractional ordering key — scheme fixed by ADR. */
export type OrderKey = Brand<string, "OrderKey">;

export interface Issue {
  id: IssueId;
  teamId: TeamId;
  /** Per-team sequence. */
  number: number;
  title: string;
  /** Markdown. */
  description: string;
  stateId: StateId;
  priority: Priority;
  estimate: number | null;
  assigneeId: UserId | null;
  creatorId: UserId;
  /** Sub-issues. */
  parentId: IssueId | null;
  labelIds: LabelId[];
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

export type RelationType = "blocks" | "blocked_by" | "related";

export interface IssueRelation {
  issueId: IssueId;
  relatedIssueId: IssueId;
  type: RelationType;
}

/** Human-facing identifier, e.g. "ENG-101". */
export const issueIdentifier = (teamKey: string, n: number): string => `${teamKey}-${n}`;
