import { randomUUID } from "node:crypto";
import { NotFoundError } from "@curves/domain/core/errors";
import { type ProjectId, projectId as projectIdCtor, type UserId } from "@curves/domain/core/ids";
import type { Project } from "@curves/domain/projects/project.types";
import { asc, eq } from "drizzle-orm";
import { projects } from "../schema/projects";
import type { Db } from "./issue.repo";

export type ProjectRow = typeof projects.$inferSelect;

export interface CreateProjectInput {
  /** Deterministic id for seed/tests; a random UUID otherwise. */
  id?: ProjectId;
  name: string;
  description: string;
  leadId?: UserId | null;
  targetDate?: Date | null;
  /** Deterministic clock for seed/tests; defaults to now. */
  createdAt?: Date;
}

/** Every column a caller may patch; status/health transitions are domain policy (Phase 4). */
export interface ProjectPatch {
  name?: string;
  description?: string;
  status?: Project["status"];
  health?: Project["health"];
  leadId?: UserId | null;
  targetDate?: Date | null;
}

export interface ProjectRepo {
  byId(id: ProjectId): Promise<Project | null>;
  /** Ordered by name — deterministic for the projects index. */
  list(): Promise<Project[]>;
  /** New projects start "planned" with no health signal until triage moves them. */
  create(input: CreateProjectInput): Promise<Project>;
  /** Throws NotFoundError when the project does not exist. */
  update(id: ProjectId, patch: ProjectPatch): Promise<Project>;
}

export const createProjectRepo = (db: Db): ProjectRepo => {
  const toDomain = (row: ProjectRow): Project => row;

  const byId = async (id: ProjectId): Promise<Project | null> => {
    const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    const row = rows[0];
    return row === undefined ? null : toDomain(row);
  };

  return {
    byId,

    list: async () => {
      const rows = await db.select().from(projects).orderBy(asc(projects.name));
      return rows.map(toDomain);
    },

    create: async (input) => {
      const values = {
        id: input.id ?? projectIdCtor(randomUUID()),
        name: input.name,
        description: input.description,
        status: "planned" as const,
        health: null,
        leadId: input.leadId ?? null,
        targetDate: input.targetDate ?? null,
        createdAt: input.createdAt ?? new Date(),
      };
      await db.insert(projects).values(values);
      return toDomain(values);
    },

    update: async (id, patch) => {
      if (Object.keys(patch).length === 0) {
        // drizzle refuses .set({}) — an empty patch is a read with existence check
        const existing = await byId(id);
        if (existing === null) {
          throw new NotFoundError(`project ${id} does not exist`);
        }
        return existing;
      }
      const rows = await db.update(projects).set(patch).where(eq(projects.id, id)).returning();
      const row = rows[0];
      if (row === undefined) {
        throw new NotFoundError(`project ${id} does not exist`);
      }
      return toDomain(row);
    },
  };
};
