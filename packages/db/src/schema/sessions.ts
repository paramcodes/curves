import type { UserId } from "@curves/domain/core/ids";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * better-auth's `session` model (verified against better-auth 1.7.12): one
 * active browser session. Column property names match better-auth's expected
 * field names exactly (the drizzle adapter indexes the table by them);
 * snake_case casing turns them into the DB columns.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    userId: text()
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);
