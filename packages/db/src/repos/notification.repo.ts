import { randomUUID } from "node:crypto";
import { NotFoundError, ValidationError } from "@curves/domain/core/errors";
import {
  type IssueId,
  type NotificationId,
  notificationId as notificationIdCtor,
  type ProjectId,
  type UserId,
} from "@curves/domain/core/ids";
import type { Notification } from "@curves/domain/notifications/notification.types";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { notifications } from "../schema/notifications";
import type { Db } from "./issue.repo";

export type NotificationRow = typeof notifications.$inferSelect;

export interface CreateNotificationInput {
  /** Deterministic id for seed/tests; a random UUID otherwise. */
  id?: NotificationId;
  userId: UserId;
  type: Notification["type"];
  entityType: "issue" | "project";
  entityId: IssueId | ProjectId;
  /** Deterministic clock for seed/tests; defaults to now. */
  createdAt?: Date;
  readAt?: Date | null;
  snoozedUntil?: Date | null;
}

export interface NotificationRepo {
  /** Newest first (createdAt desc; id breaks ties), bounded by limit. */
  byUser(userId: UserId, opts?: { limit?: number }): Promise<Notification[]>;
  /** Rows with readAt still null — the inbox badge. */
  unreadCount(userId: UserId): Promise<number>;
  create(input: CreateNotificationInput): Promise<Notification>;
  /**
   * Marks read only when the notification belongs to `userId` — another
   * user's id is indistinguishable from a missing one (no existence oracle):
   * NotFoundError, and the row's readAt is untouched.
   */
  markRead(id: NotificationId, userId: UserId): Promise<void>;
  /** Marks every unread notification of the user read at `at`; returns how many. */
  markAllRead(userId: UserId, at: Date): Promise<number>;
}

export const createNotificationRepo = (db: Db): NotificationRepo => {
  const toDomain = (row: NotificationRow): Notification => row;

  const assertLimit = (limit: number): void => {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new ValidationError(`limit must be a positive integer, got ${limit}`);
    }
  };

  return {
    byUser: async (userId, opts) => {
      const limit = opts?.limit;
      if (limit !== undefined) {
        assertLimit(limit);
      }
      const query = db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt), desc(notifications.id));
      const rows = limit === undefined ? await query : await query.limit(limit);
      return rows.map(toDomain);
    },

    unreadCount: async (userId) => {
      const rows = await db
        .select({ value: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
      return rows[0]?.value ?? 0;
    },

    create: async (input) => {
      const values = {
        id: input.id ?? notificationIdCtor(randomUUID()),
        userId: input.userId,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        createdAt: input.createdAt ?? new Date(),
        readAt: input.readAt ?? null,
        snoozedUntil: input.snoozedUntil ?? null,
      };
      await db.insert(notifications).values(values);
      return toDomain(values);
    },

    markRead: async (id, userId) => {
      const rows = await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
        .returning();
      if (rows[0] === undefined) {
        throw new NotFoundError(`notification ${id} does not exist for user ${userId}`);
      }
    },

    markAllRead: async (userId, at) => {
      const rows = await db
        .update(notifications)
        .set({ readAt: at })
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
        .returning();
      return rows.length;
    },
  };
};
