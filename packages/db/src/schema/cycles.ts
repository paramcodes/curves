import type { CycleId, TeamId } from "@curves/domain/core/ids";
import { integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { teams } from "./teams";

export const cycles = pgTable(
  "cycles",
  {
    id: text().$type<CycleId>().primaryKey(),
    teamId: text()
      .$type<TeamId>()
      .notNull()
      .references(() => teams.id),
    number: integer().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [unique("cycles_team_number_unique").on(t.teamId, t.number)],
);
