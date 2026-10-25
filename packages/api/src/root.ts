import { healthRouter } from "./routers/health";
import { router } from "./trpc/trpc";

/**
 * Root router. Real resource routers mount here next slice; every one of them
 * falls under the registry test (src/routers/registry.test.ts), which walks
 * this router's procedures and enforces the mutation-registry + list
 * contract — see health.ts for what a router module must export.
 */
export const appRouter = router({
  health: healthRouter,
});

export type AppRouter = typeof appRouter;
