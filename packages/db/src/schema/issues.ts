import type {
  CycleId,
  IssueId,
  MilestoneId,
  ProjectId,
  StateId,
  TeamId,
  UserId,
} from "@curves/domain/core/ids";
import type { OrderKey, Priority } from "@curves/domain/issues/issue.types";
import {
  type AnyPgColumn,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { cycles } from "./cycles";
import { milestones } from "./milestones";
import { projects } from "./projects";
import { states } from "./states";
import { teams } from "./teams";
import { users } from "./users";

export const issues = pgTable(
  "issues",
  {
    id: text().$type<IssueId>().primaryKey(),
    teamId: text()
      .$type<TeamId>()
      .notNull()
      .references(() => teams.id),
    /** Per-team sequence — identifier "ENG-123". */
    number: integer().notNull(),
    title: text().notNull(),
    description: text().notNull(),
    stateId: text()
      .$type<StateId>()
      .notNull()
      .references(() => states.id),
    priority: integer().$type<Priority>().notNull(),
    estimate: integer(),
    assigneeId: text()
      .$type<UserId>()
      .references(() => users.id),
    creatorId: text()
      .$type<UserId>()
      .notNull()
      .references(() => users.id),
    /** Sub-issues. */
    parentId: text()
      .$type<IssueId>()
      .references((): AnyPgColumn => issues.id),
    /** Fractional ordering key (ADR 0005). */
    order: text().$type<OrderKey>().notNull(),
    projectId: text()
      .$type<ProjectId>()
      .references(() => projects.id),
    milestoneId: text()
      .$type<MilestoneId>()
      .references(() => milestones.id),
    cycleId: text()
      .$type<CycleId>()
      .references(() => cycles.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    canceledAt: timestamp({ withTimezone: true }),
    archivedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    unique("issues_team_number_unique").on(t.teamId, t.number),
    index("issues_team_idx").on(t.teamId),
    index("issues_state_idx").on(t.stateId),
    index("issues_assignee_idx").on(t.assigneeId),
    index("issues_project_idx").on(t.projectId),
    index("issues_cycle_idx").on(t.cycleId),
    index("issues_order_idx").on(t.order),
  ],
);
