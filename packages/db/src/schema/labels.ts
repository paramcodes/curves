import type { LabelId, TeamId } from "@curves/domain/core/ids";
import { index, pgTable, text, unique } from "drizzle-orm/pg-core";
import { teams } from "./teams";

export const labels = pgTable(
  "labels",
  {
    id: text().$type<LabelId>().primaryKey(),
    teamId: text()
      .$type<TeamId>()
      .notNull()
      .references(() => teams.id),
    name: text().notNull(),
    color: text().notNull(),
  },
  (t) => [
    index("labels_team_idx").on(t.teamId),
    unique("labels_team_name_unique").on(t.teamId, t.name),
  ],
);
