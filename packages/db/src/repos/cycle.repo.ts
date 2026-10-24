import { randomUUID } from "node:crypto";
import { DuplicateError, ValidationError } from "@curves/domain/core/errors";
import { type CycleId, cycleId as cycleIdCtor, type TeamId } from "@curves/domain/core/ids";
import type { Cycle } from "@curves/domain/cycles/cycle.types";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { cycles } from "../schema/cycles";
import type { Db } from "./issue.repo";
import { isUniqueViolation } from "./pg-errors";

export type CycleRow = typeof cycles.$inferSelect;

export interface CreateCycleInput {
  /** Deterministic id for seed/tests; a random UUID otherwise. */
  id?: CycleId;
  teamId: TeamId;
  number: number;
  startsAt: Date;
  endsAt: Date;
}

export interface CycleRepo {
  byId(id: CycleId): Promise<Cycle | null>;
  /** Ordered by number (unique per team) — deterministic. */
  byTeam(teamId: TeamId): Promise<Cycle[]>;
  /**
   * Latest cycle of the team that had already ended at `at`. Boundary mirrors
   * domain classifyCycle (cycle-math.ts): endsAt is EXCLUSIVE, so a cycle
   * ending exactly at `at` counts as ended — hence `lte`, not `lt`.
   */
  latestEndedBefore(teamId: TeamId, at: Date): Promise<Cycle | null>;
  /**
   * Earliest cycle starting at or after `at`. startsAt is INCLUSIVE, so a
   * contiguous follow-up (next.startsAt === finished.endsAt) is found; a
   * positive-length cycle never matches itself at its own end instant.
   */
  nextAfter(teamId: TeamId, at: Date): Promise<Cycle | null>;
  create(input: CreateCycleInput): Promise<Cycle>;
}

export const createCycleRepo = (db: Db): CycleRepo => {
  const toDomain = (row: CycleRow): Cycle => row;

  return {
    byId: async (id) => {
      const rows = await db.select().from(cycles).where(eq(cycles.id, id)).limit(1);
      const row = rows[0];
      return row === undefined ? null : toDomain(row);
    },

    byTeam: async (teamId) => {
      const rows = await db
        .select()
        .from(cycles)
        .where(eq(cycles.teamId, teamId))
        .orderBy(asc(cycles.number));
      return rows.map(toDomain);
    },

    latestEndedBefore: async (teamId, at) => {
      const rows = await db
        .select()
        .from(cycles)
        .where(and(eq(cycles.teamId, teamId), lte(cycles.endsAt, at)))
        .orderBy(desc(cycles.endsAt))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toDomain(row);
    },

    nextAfter: async (teamId, at) => {
      const rows = await db
        .select()
        .from(cycles)
        .where(and(eq(cycles.teamId, teamId), gte(cycles.startsAt, at)))
        .orderBy(asc(cycles.startsAt), asc(cycles.number))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toDomain(row);
    },

    create: async (input) => {
      if (input.startsAt.getTime() >= input.endsAt.getTime()) {
        // a zero/negative-length cycle is invisible to classifyCycle (never
        // "current") and unrunnable by the rollover job — refuse at the boundary
        throw new ValidationError(
          `cycle ${input.number} for team ${input.teamId}: startsAt must be before endsAt`,
        );
      }
      const values = {
        id: input.id ?? cycleIdCtor(randomUUID()),
        teamId: input.teamId,
        number: input.number,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      };
      try {
        await db.insert(cycles).values(values);
      } catch (err) {
        // (teamId, number) is caller-chosen: a duplicate is a caller bug, not a
        // race to win (unlike issue numbers, ADR 0006) — no retry, typed error.
        if (isUniqueViolation(err)) {
          throw new DuplicateError(
            `cycle number ${input.number} already exists for team ${input.teamId}`,
          );
        }
        throw err;
      }
      return toDomain(values);
    },
  };
};
