import { randomUUID } from "node:crypto";
import { NotFoundError } from "@curves/domain/core/errors";
import {
  type MilestoneId,
  milestoneId as milestoneIdCtor,
  type ProjectId,
} from "@curves/domain/core/ids";
import type { ProjectMilestone } from "@curves/domain/projects/project.types";
import { asc, eq } from "drizzle-orm";
import { milestones } from "../schema/milestones";
import type { Db } from "./issue.repo";

export type MilestoneRow = typeof milestones.$inferSelect;

export interface CreateMilestoneInput {
  /** Deterministic id for seed/tests; a random UUID otherwise. */
  id?: MilestoneId;
  projectId: ProjectId;
  name: string;
  targetDate?: Date | null;
  position: number;
}

export interface MilestonePatch {
  name?: string;
  targetDate?: Date | null;
  position?: number;
}

export interface MilestoneRepo {
  /** Ordered by position; id breaks ties (positions are caller-managed, not unique). */
  byProject(projectId: ProjectId): Promise<ProjectMilestone[]>;
  byId(id: MilestoneId): Promise<ProjectMilestone | null>;
  create(input: CreateMilestoneInput): Promise<ProjectMilestone>;
  /** Throws NotFoundError when the milestone does not exist. */
  update(id: MilestoneId, patch: MilestonePatch): Promise<ProjectMilestone>;
}

export const createMilestoneRepo = (db: Db): MilestoneRepo => {
  const toDomain = (row: MilestoneRow): ProjectMilestone => row;

  const byId = async (id: MilestoneId): Promise<ProjectMilestone | null> => {
    const rows = await db.select().from(milestones).where(eq(milestones.id, id)).limit(1);
    const row = rows[0];
    return row === undefined ? null : toDomain(row);
  };

  return {
    byProject: async (projectId) => {
      const rows = await db
        .select()
        .from(milestones)
        .where(eq(milestones.projectId, projectId))
        .orderBy(asc(milestones.position), asc(milestones.id));
      return rows.map(toDomain);
    },

    byId,

    create: async (input) => {
      const values = {
        id: input.id ?? milestoneIdCtor(randomUUID()),
        projectId: input.projectId,
        name: input.name,
        targetDate: input.targetDate ?? null,
        position: input.position,
      };
      await db.insert(milestones).values(values);
      return toDomain(values);
    },

    update: async (id, patch) => {
      if (Object.keys(patch).length === 0) {
        const existing = await byId(id);
        if (existing === null) {
          throw new NotFoundError(`milestone ${id} does not exist`);
        }
        return existing;
      }
      const rows = await db.update(milestones).set(patch).where(eq(milestones.id, id)).returning();
      const row = rows[0];
      if (row === undefined) {
        throw new NotFoundError(`milestone ${id} does not exist`);
      }
      return toDomain(row);
    },
  };
};
