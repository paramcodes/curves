import { createNotificationRepo } from "@curves/db/repos/notification.repo";
import { notificationId } from "@curves/domain/core/ids";
import { z } from "zod";
import { mutation, protectedProcedure, router } from "../trpc/trpc";

/**
 * Notifications are strictly per-user: every procedure scopes to
 * ctx.user — there is no notification id a caller can pass that touches
 * another user's inbox. markRead's ownership guard lives in the repo
 * (markRead(id, userId) — another user's id 404s without leaking existence);
 * markAllRead only ever reaches the caller's own rows.
 */
export const notificationsRouter = router({
  /** Newest first (repo contract), bounded by limit. */
  my: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100) }).optional())
    .query(({ ctx, input }) =>
      createNotificationRepo(ctx.db).byUser(
        ctx.user.id,
        input ? { limit: input.limit } : undefined,
      ),
    ),

  unreadCount: protectedProcedure.query(({ ctx }) =>
    createNotificationRepo(ctx.db).unreadCount(ctx.user.id),
  ),

  markRead: mutation({
    input: z.object({ id: z.string().min(1).transform(notificationId) }),
    // The authz decision is DELEGATED to the repo ownership guard:
    // markRead(id, userId) 404s another user's notification without leaking
    // existence — there is no router-side team/workspace scope to check.
    authorize: () => {},
    resolve: async ({ ctx, input }) => {
      await createNotificationRepo(ctx.db).markRead(input.id, ctx.user.id);
      return { id: input.id };
    },
  }),

  markAllRead: mutation({
    input: z.void(),
    // Repo-scoped by construction: markAllRead(userId) only ever reaches the
    // caller's own rows — the userId IS the scope, nothing else to check.
    authorize: () => {},
    resolve: async ({ ctx }) => {
      const count = await createNotificationRepo(ctx.db).markAllRead(ctx.user.id, new Date());
      return { count };
    },
  }),
});

/** Registry list: mutation procedure keys in this router (registry-test contract). */
export const mutations = ["markRead", "markAllRead"] as const;
