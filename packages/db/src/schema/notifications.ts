import type { IssueId, NotificationId, ProjectId, UserId } from "@curves/domain/core/ids";
import type { NotificationType } from "@curves/domain/notifications/notification.types";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const notifications = pgTable(
  "notifications",
  {
    id: text().$type<NotificationId>().primaryKey(),
    userId: text()
      .$type<UserId>()
      .notNull()
      .references(() => users.id),
    type: text().$type<NotificationType>().notNull(),
    entityType: text().$type<"issue" | "project">().notNull(),
    entityId: text().$type<IssueId | ProjectId>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp({ withTimezone: true }),
    snoozedUntil: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId),
    index("notifications_read_at_idx").on(t.readAt),
  ],
);
