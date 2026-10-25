import { protectedProcedure, router } from "../trpc/trpc";

/**
 * The caller's own identity — the SafeUser projection from the context
 * (context.ts): stable identity fields only (id/name/email/avatarUrl), never
 * the raw better-auth record. Profile mutations arrive with the auth slices
 * that own them; this router exists so the client has one tRPC namespace for
 * user reads.
 */
export const usersRouter = router({
  me: protectedProcedure.query(({ ctx }) => ctx.user),
});

/** Registry list: mutation procedure keys in this router — none, read-only. */
export const mutations = [] as const;
