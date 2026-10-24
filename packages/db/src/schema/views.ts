import type { TeamId, UserId, ViewId } from "@curves/domain/core/ids";
import type { DisplaySpec } from "@curves/domain/filters/display.types";
import type { FilterSpec } from "@curves/domain/filters/filter.types";
import { boolean, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { teams } from "./teams";
import { users } from "./users";

export const views = pgTable(
  "views",
  {
    id: text().$type<ViewId>().primaryKey(),
    ownerId: text()
      .$type<UserId>()
      .notNull()
      .references(() => users.id),
    /** null → a personal view, not scoped to a team. */
    teamId: text()
      .$type<TeamId>()
      .references(() => teams.id),
    name: text().notNull(),
    filter: jsonb().$type<FilterSpec>().notNull(),
    display: jsonb().$type<DisplaySpec>().notNull(),
    isTeamDefault: boolean().notNull().default(false),
  },
  (t) => [index("views_owner_idx").on(t.ownerId)],
);
