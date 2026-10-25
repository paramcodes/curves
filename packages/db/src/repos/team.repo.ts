import { randomUUID } from "node:crypto";
import { DuplicateError } from "@curves/domain/core/errors";
import { type TeamId, teamId as teamIdCtor, type UserId } from "@curves/domain/core/ids";
import type { Team, TeamRole } from "@curves/domain/teams/team.types";
import { and, asc, eq } from "drizzle-orm";
import { teamMembers } from "../schema/team_members";
import { teams } from "../schema/teams";
import type { Db } from "./issue.repo";
import { isUniqueViolation } from "./pg-errors";

/** Drizzle row for teams — never leaves this package. */
export type TeamRow = typeof teams.$inferSelect;

export interface CreateTeamInput {
  /** Deterministic id for seed/tests; a random UUID otherwise. */
  id?: TeamId;
  /** Short human-facing code ("ENG") used in issue identifiers; unique. */
  key: string;
  name: string;
  /**
   * When set, the creator's team_members row (role "admin") is written in the
   * SAME transaction — a team without at least one admin member rejects every
   * team-scoped action, so create-without-membership would produce an
   * unusable team. Omitted only by legacy direct-seed callers.
   */
  creatorId?: UserId;
}

export interface TeamRepo {
  byId(id: TeamId): Promise<Team | null>;
  /** Key is the short human code ("ENG") used in issue identifiers; unique. */
  byKey(key: string): Promise<Team | null>;
  list(): Promise<Team[]>;
  create(input: CreateTeamInput): Promise<Team>;
}

/**
 * The authz lookup (phase 2, `assertCanAct` in packages/api): the caller's
 * role within one team, or null when not a member. Lives in db, not api, so
 * SQL building never crosses the api→db boundary (api cannot import
 * drizzle-orm — its drizzle copy is type-incompatible with db's, the
 * same nominal-type hazard test-db.ts documents).
 */
export const teamRoleFor = async (db: Db, team: TeamId, user: UserId): Promise<TeamRole | null> => {
  const rows = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, team), eq(teamMembers.userId, user)))
    .limit(1);
  return rows[0]?.role ?? null;
};

/**
 * Teams were read-only through Phase 1 (the contract seeded rows directly);
 * `create` arrived with the Phase 2 API (createTeam mutation, workspace
 * scope). The key is the short human code ("ENG") — unique per the schema,
 * so a collision maps to the typed DuplicateError like the label repo's.
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

    create: async (input) => {
      const values = {
        id: input.id ?? teamIdCtor(randomUUID()),
        key: input.key,
        name: input.name,
      };
      await db.transaction(async (tx) => {
        try {
          await tx.insert(teams).values(values);
        } catch (err) {
          if (isUniqueViolation(err)) {
            throw new DuplicateError(`team key "${input.key}" is already taken`);
          }
          throw err;
        }
        if (input.creatorId !== undefined) {
          await tx.insert(teamMembers).values({
            teamId: values.id,
            userId: input.creatorId,
            role: "admin",
          });
        }
      });
      return toDomain(values);
    },
  };
};
