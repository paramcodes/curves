import { randomUUID } from "node:crypto";
import { ValidationError } from "@curves/domain/core/errors";
import {
  type CommentId,
  commentId as commentIdCtor,
  type IssueId,
  type UserId,
} from "@curves/domain/core/ids";
import type { Comment } from "@curves/domain/issues/comment.types";
import { asc, eq } from "drizzle-orm";
import { comments } from "../schema/comments";
import type { Db } from "./issue.repo";

export type CommentRow = typeof comments.$inferSelect;

export interface CreateCommentInput {
  /** Deterministic id for seed/tests; a random UUID otherwise. */
  id?: CommentId;
  issueId: IssueId;
  authorId: UserId;
  body: string;
  /** Deterministic clock for seed/tests; defaults to now. */
  createdAt?: Date;
}

export interface CommentRepo {
  /** Chronological reading order (createdAt asc; id breaks ties). */
  byIssue(issueId: IssueId, limit?: number): Promise<Comment[]>;
  create(input: CreateCommentInput): Promise<Comment>;
}

/**
 * Comments are plain rows: no edits yet (Phase 6 adds update-with-history if
 * needed). Creating a comment does NOT touch the parent issue's updatedAt —
 * that side effect belongs to the mutation layer that also writes the
 * "commented" activity (Phase 2+), not to the storage boundary.
 */
export const createCommentRepo = (db: Db): CommentRepo => {
  const toDomain = (row: CommentRow): Comment => row;

  const assertLimit = (limit: number): void => {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new ValidationError(`limit must be a positive integer, got ${limit}`);
    }
  };

  return {
    byIssue: async (issueId, limit) => {
      if (limit !== undefined) {
        assertLimit(limit);
      }
      const query = db
        .select()
        .from(comments)
        .where(eq(comments.issueId, issueId))
        .orderBy(asc(comments.createdAt), asc(comments.id));
      const rows = limit === undefined ? await query : await query.limit(limit);
      return rows.map(toDomain);
    },

    create: async (input) => {
      const createdAt = input.createdAt ?? new Date();
      const values = {
        id: input.id ?? commentIdCtor(randomUUID()),
        issueId: input.issueId,
        authorId: input.authorId,
        body: input.body,
        createdAt,
        updatedAt: createdAt,
      };
      await db.insert(comments).values(values);
      return toDomain(values);
    },
  };
};
