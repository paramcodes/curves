import type { StateId, TeamId } from "@curves/domain/core/ids";
import type { StateCategory } from "@curves/domain/teams/workflow.types";
import { index, integer, pgTable, text, unique } from "drizzle-orm/pg-core";
import { teams } from "./teams";

export const states = pgTable(
  "states",
  {
    id: text().$type<StateId>().primaryKey(),
    teamId: text()
      .$type<TeamId>()
      .notNull()
      .references(() => teams.id),
    name: text().notNull(),
    category: text().$type<StateCategory>().notNull(),
    /** Ordered within a team; NOT unique — reorderable. */
    position: integer().notNull(),
  },
  (t) => [
    unique("states_team_name_unique").on(t.teamId, t.name),
    index("states_team_idx").on(t.teamId),
  ],
);
