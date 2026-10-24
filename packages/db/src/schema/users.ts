import type { UserId } from "@curves/domain/core/ids";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text().$type<UserId>().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  avatarUrl: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
