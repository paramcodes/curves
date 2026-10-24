import type { IssueId, UserId } from "@curves/domain/core/ids";
import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { issues } from "./issues";
import { users } from "./users";

/**
 * No domain type exists for reactions yet (CORE_MODEL section 7 lists the
 * table, section 2 has no Reaction entity) — minimal shape, revisit when the
 * domain type lands.
 */
export const reactions = pgTable(
  "reactions",
  {
    id: text().primaryKey(),
    issueId: text()
      .$type<IssueId>()
      .notNull()
      .references(() => issues.id),
    userId: text()
      .$type<UserId>()
      .notNull()
      .references(() => users.id),
    emoji: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("reactions_issue_user_emoji_unique").on(t.issueId, t.userId, t.emoji),
    index("reactions_issue_idx").on(t.issueId),
  ],
);
