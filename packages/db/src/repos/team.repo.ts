import type { TeamId } from "@curves/domain/core/ids";
import type { Team } from "@curves/domain/teams/team.types";
import { asc, eq } from "drizzle-orm";
import { teams } from "../schema/teams";
import type { Db } from "./issue.repo";

/** Drizzle row for teams — never leaves this package. */
export type TeamRow = typeof teams.$inferSelect;

export interface TeamRepo {
  byId(id: TeamId): Promise<Team | null>;
  /** Key is the short human code ("ENG") used in issue identifiers; unique. */
  byKey(key: string): Promise<Team | null>;
  list(): Promise<Team[]>;
}

/**
 * Teams are identity rows with no storage-side lifecycle of their own —
 * creation happens through team setup (Phase 2+), so this repo is read-only
 * for now and the contract seeds rows directly. `list` is ordered by key for
 * deterministic output; columns map 1:1 onto the domain type.
 */
export const createTeamRepo = (db: Db): TeamRepo => {
  const toDomain = (row: TeamRow): Team => row;

  return {
    byId: async (id) => {
      const rows = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
      const row = rows[0];
      return row === undefined ? null : toDomain(row);
    },

    byKey: async (key) => {
      const rows = await db.select().from(teams).where(eq(teams.key, key)).limit(1);
      const row = rows[0];
      return row === undefined ? null : toDomain(row);
    },

    list: async () => {
      const rows = await db.select().from(teams).orderBy(asc(teams.key));
      return rows.map(toDomain);
    },
  };
};
