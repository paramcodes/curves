import type { ProjectId, UserId } from "@curves/domain/core/ids";
import type { ProjectHealth, ProjectStatus } from "@curves/domain/projects/project.types";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const projects = pgTable("projects", {
  id: text().$type<ProjectId>().primaryKey(),
  name: text().notNull(),
  description: text().notNull(),
  status: text().$type<ProjectStatus>().notNull(),
  health: text().$type<ProjectHealth>(),
  leadId: text()
    .$type<UserId>()
    .references(() => users.id),
  targetDate: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
