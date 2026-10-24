import { randomUUID } from "node:crypto";
import type { Activity, ActivityVerb } from "@curves/domain/activities/activity.types";
import { ValidationError } from "@curves/domain/core/errors";
import {
  type ActivityId,
  activityId as activityIdCtor,
  type IssueId,
  type ProjectId,
  type UserId,
} from "@curves/domain/core/ids";
import { and, asc, desc, eq } from "drizzle-orm";
import { activities } from "../schema/activities";
import type { Db } from "./issue.repo";

export type ActivityRow = typeof activities.$inferSelect;

export interface RecordActivityInput {
  /** Deterministic id for seed/tests; a random UUID otherwise. */
  id?: ActivityId;
  actorId: UserId;
  verb: ActivityVerb;
  entityType: Activity["entityType"];
  entityId: IssueId | ProjectId;
  /** Per-verb zod shape — validated upstream at the API boundary, stored as-is. */
  payload: unknown;
  /** Deterministic clock for seed/tests; defaults to now. */
  at?: Date;
}

export interface ActivityRepo {
  /** Append-only write; returns exactly what was stored. */
  record(input: RecordActivityInput): Promise<Activity>;
  /**
   * Newest first (at desc; id asc breaks ties). entityType scopes the query:
   * issue and project ids share one string space, and a collision must not
   * leak another entity type's trail.
   */
  byEntity(
    entityType: Activity["entityType"],
    entityId: IssueId | ProjectId,
    limit?: number,
  ): Promise<Activity[]>;
}

/**
 * APPEND-ONLY BY DESIGN: there are no update or delete methods, and none will
 * be added — activities are the audit trail every mutation writes (Phase 2+).
 * Corrections append compensating entries; rewriting history is not a feature.
 * The contract asserts the missing mutation surface explicitly.
 */
export const createActivityRepo = (db: Db): ActivityRepo => {
  const toDomain = (row: ActivityRow): Activity => row;

  const assertLimit = (limit: number): void => {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new ValidationError(`limit must be a positive integer, got ${limit}`);
    }
  };

  return {
    record: async (input) => {
      const values = {
        id: input.id ?? activityIdCtor(randomUUID()),
        actorId: input.actorId,
        verb: input.verb,
        entityType: input.entityType,
        entityId: input.entityId,
        payload: input.payload,
        at: input.at ?? new Date(),
      };
      await db.insert(activities).values(values);
      return toDomain(values);
    },

    byEntity: async (entityType, entityId, limit) => {
      if (limit !== undefined) {
        assertLimit(limit);
      }
      const query = db
        .select()
        .from(activities)
        .where(and(eq(activities.entityType, entityType), eq(activities.entityId, entityId)))
        .orderBy(desc(activities.at), asc(activities.id));
      const rows = limit === undefined ? await query : await query.limit(limit);
      return rows.map(toDomain);
    },
  };
};
