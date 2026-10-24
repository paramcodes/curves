import type { IssueId, NotificationId, ProjectId, UserId } from "../core/ids";

export type NotificationType = "assignment" | "mention" | "subscription";

export interface Notification {
  id: NotificationId;
  userId: UserId;
  type: NotificationType;
  entityType: "issue" | "project";
  entityId: IssueId | ProjectId;
  createdAt: Date;
  readAt: Date | null;
  snoozedUntil: Date | null;
}
