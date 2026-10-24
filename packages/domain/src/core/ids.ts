import type { Brand } from "./brand";

export type UserId = Brand<string, "UserId">;
export type TeamId = Brand<string, "TeamId">;
export type StateId = Brand<string, "StateId">;
export type LabelId = Brand<string, "LabelId">;
export type IssueId = Brand<string, "IssueId">;
export type ProjectId = Brand<string, "ProjectId">;
export type MilestoneId = Brand<string, "MilestoneId">;
export type CycleId = Brand<string, "CycleId">;
export type CommentId = Brand<string, "CommentId">;
export type ActivityId = Brand<string, "ActivityId">;
export type NotificationId = Brand<string, "NotificationId">;
export type ViewId = Brand<string, "ViewId">;

export const userId = (s: string): UserId => s as UserId;
export const teamId = (s: string): TeamId => s as TeamId;
export const stateId = (s: string): StateId => s as StateId;
export const labelId = (s: string): LabelId => s as LabelId;
export const issueId = (s: string): IssueId => s as IssueId;
export const projectId = (s: string): ProjectId => s as ProjectId;
export const milestoneId = (s: string): MilestoneId => s as MilestoneId;
export const cycleId = (s: string): CycleId => s as CycleId;
export const commentId = (s: string): CommentId => s as CommentId;
export const activityId = (s: string): ActivityId => s as ActivityId;
export const notificationId = (s: string): NotificationId => s as NotificationId;
export const viewId = (s: string): ViewId => s as ViewId;
