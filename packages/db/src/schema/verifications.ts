import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * better-auth's `verification` model (verified against better-auth 1.7.12):
 * one-time values for flows like email verification and password reset.
 * Column property names match better-auth's expected field names.
 */
export const verifications = pgTable("verifications", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
