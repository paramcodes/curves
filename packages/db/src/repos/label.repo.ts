import { randomUUID } from "node:crypto";
import { DuplicateError } from "@curves/domain/core/errors";
import { type LabelId, labelId as labelIdCtor, type TeamId } from "@curves/domain/core/ids";
import type { Label } from "@curves/domain/teams/workflow.types";
import { asc, eq } from "drizzle-orm";
import { labels } from "../schema/labels";
import type { Db } from "./issue.repo";
import { isUniqueViolation } from "./pg-errors";

export type LabelRow = typeof labels.$inferSelect;

export interface CreateLabelInput {
  /** Deterministic id for seed/tests; a random UUID otherwise. */
  id?: LabelId;
  teamId: TeamId;
  name: string;
  color: string;
}

export interface LabelRepo {
  byId(id: LabelId): Promise<Label | null>;
  /** The team's labels ordered by name — deterministic for pickers. */
  byTeam(teamId: TeamId): Promise<Label[]>;
  /**
   * (teamId, name) is unique (labels_team_name_unique): a duplicate is a
   * caller-level naming collision, mapped to the typed DuplicateError —
   * no retry (the human picks another name).
   */
  create(input: CreateLabelInput): Promise<Label>;
  rename(id: LabelId, name: string): Promise<void>;
  delete(id: LabelId): Promise<void>;
}

export const createLabelRepo = (db: Db): LabelRepo => {
  const toDomain = (row: LabelRow): Label => row;

  return {
    byId: async (id) => {
      const rows = await db.select().from(labels).where(eq(labels.id, id)).limit(1);
      const row = rows[0];
      return row === undefined ? null : toDomain(row);
    },

    byTeam: async (teamId) => {
      const rows = await db
        .select()
        .from(labels)
        .where(eq(labels.teamId, teamId))
        .orderBy(asc(labels.name));
      return rows.map(toDomain);
    },

    create: async (input) => {
      const values = {
        id: input.id ?? labelIdCtor(randomUUID()),
        teamId: input.teamId,
        name: input.name,
        color: input.color,
      };
      try {
        await db.insert(labels).values(values);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new DuplicateError(`label "${input.name}" already exists for team ${input.teamId}`);
        }
        throw err;
      }
      return toDomain(values);
    },

    rename: async (id, name) => {
      // renames can also collide with a sibling label — same typed mapping
      try {
        await db.update(labels).set({ name }).where(eq(labels.id, id));
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new DuplicateError(`label "${name}" already exists`);
        }
        throw err;
      }
    },

    delete: async (id) => {
      await db.delete(labels).where(eq(labels.id, id));
    },
  };
};
