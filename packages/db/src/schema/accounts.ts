import type { UserId } from "@curves/domain/core/ids";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * better-auth's `account` model (verified against better-auth 1.7.12): one
 * external identity per row. Email+password sign-in writes a single row with
 * providerId "credential", accountId = the user's id, and only `password`
 * set. Column property names match better-auth's expected field names.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);
