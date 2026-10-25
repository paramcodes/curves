import { publicProcedure, router } from "../trpc/trpc";

/**
 * Minimal shell router proving the tRPC foundation runs end-to-end. Real
 * routers (issues, teams, …) land next slice and MUST:
 *   - build mutations only through `mutation(...)` from trpc.ts, and
 *   - export `mutations: readonly string[]` with their mutation keys —
 *     the registry test cross-checks both.
 */
export const healthRouter = router({
  check: publicProcedure.query(() => ({ ok: true as const, time: new Date().toISOString() })),
});

/** Registry list: mutation keys in this router (none — query-only shell). */
export const mutations: readonly string[] = [];
