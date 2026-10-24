import type { ActivityVerb } from "@curves/domain/activities/activity.types";
import type { ActivityId, IssueId, ProjectId, UserId } from "@curves/domain/core/ids";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

export const activities = pgTable(
  "activities",
  {
    id: text().$type<ActivityId>().primaryKey(),
    actorId: text()
      .$type<UserId>()
      .notNull()
      .references(() => users.id),
    verb: text().$type<ActivityVerb>().notNull(),
    entityType: text().$type<"issue" | "project">().notNull(),
    entityId: text().$type<IssueId | ProjectId>().notNull(),
    /** Per-verb shape validated by domain zod schemas at the API boundary. */
    payload: jsonb().$type<unknown>().notNull(),
    at: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    index("activities_entity_idx").on(t.entityId),
    index("activities_actor_idx").on(t.actorId),
  ],
);
