import type { TeamId, UserId } from "@curves/domain/core/ids";
import type { TeamRole } from "@curves/domain/teams/team.types";
import { index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { teams } from "./teams";
import { users } from "./users";

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: text()
      .$type<TeamId>()
      .notNull()
      .references(() => teams.id),
    userId: text()
      .$type<UserId>()
      .notNull()
      .references(() => users.id),
    role: text().$type<TeamRole>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.userId] }),
    index("team_members_user_idx").on(t.userId),
  ],
);
