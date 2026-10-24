import type { CommentId, IssueId, UserId } from "@curves/domain/core/ids";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { issues } from "./issues";
import { users } from "./users";

export const comments = pgTable(
  "comments",
  {
    id: text().$type<CommentId>().primaryKey(),
    issueId: text()
      .$type<IssueId>()
      .notNull()
      .references(() => issues.id),
    authorId: text()
      .$type<UserId>()
      .notNull()
      .references(() => users.id),
    body: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_issue_idx").on(t.issueId)],
);
