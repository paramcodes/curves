import type { MilestoneId, ProjectId } from "@curves/domain/core/ids";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { projects } from "./projects";

export const milestones = pgTable(
  "milestones",
  {
    id: text().$type<MilestoneId>().primaryKey(),
    projectId: text()
      .$type<ProjectId>()
      .notNull()
      .references(() => projects.id),
    name: text().notNull(),
    targetDate: timestamp({ withTimezone: true }),
    position: integer().notNull(),
  },
  (t) => [index("milestones_project_idx").on(t.projectId)],
);
