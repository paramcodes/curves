import type { UserId } from "@curves/domain/core/ids";
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Shared identity table: application users AND better-auth's `user` model
 * (the drizzle adapter is pointed at this table). `avatarUrl` is better-auth's
 * `image` field — mapped via `user.fields.image` in packages/api's auth config
 * (the domain keeps avatarUrl as the name).
 */
export const users = pgTable("users", {
  id: text().$type<UserId>().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  avatarUrl: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
