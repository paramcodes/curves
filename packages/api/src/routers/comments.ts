import { createActivityRepo } from "@curves/db/repos/activity.repo";
import { createCommentRepo } from "@curves/db/repos/comment.repo";
import { createIssueRepo } from "@curves/db/repos/issue.repo";
import { NotFoundError } from "@curves/domain/core/errors";
import { issueId } from "@curves/domain/core/ids";
import { z } from "zod";
import { assertCanAct } from "../authz";
import { mutation, protectedProcedure, router } from "../trpc/trpc";

/**
 * Comments attach to issues; the issue's OWN team scopes the write (the row,
 * not the request, authorizes — loadForMutation's rule from issues.ts).
 * Reads are signed-in (workspace v1 read policy).
 *
 * create records the taxonomy's "commented" activity on the issue; the
 * payload carries the comment id so Phase 6 formatters can resolve the body
 * without duplicating comment content into the trail. Creating a comment
 * deliberately does NOT touch the issue's updatedAt (comment.repo contract).
 */
export const commentsRouter = router({
  /** Chronological reading order (repo contract). */
  byIssue: protectedProcedure
    .input(z.object({ issueId: z.string().min(1).transform(issueId) }))
    .query(({ ctx, input }) => createCommentRepo(ctx.db).byIssue(input.issueId)),

  create: mutation({
    input: z.object({
      issueId: z.string().min(1).transform(issueId),
      body: z.string().min(1).max(10_000),
    }),
    // The issue's OWN team scopes the write — the row, not the request,
    // authorizes (the comment router's rule from issues.ts).
    authorize: async (ctx, input) => {
      const issue = await createIssueRepo(ctx.db).byId(input.issueId);
      if (issue === null) {
        throw new NotFoundError(`issue ${input.issueId} not found`);
      }
      await assertCanAct(ctx, "update", { teamId: issue.teamId });
    },
    resolve: async ({ ctx, input }) => {
      // authorize already proved the issue exists and the caller is a member;
      // the activity trail uses input.issueId (the comment attaches there).
      const comment = await createCommentRepo(ctx.db).create({
        issueId: input.issueId,
        authorId: ctx.user.id,
        body: input.body,
      });
      await createActivityRepo(ctx.db).record({
        actorId: ctx.user.id,
        verb: "commented",
        entityType: "issue",
        entityId: input.issueId,
        payload: { commentId: comment.id },
      });
      return comment;
    },
  }),
});

/** Registry list: mutation procedure keys in this router (registry-test contract). */
export const mutations = ["create"] as const;
