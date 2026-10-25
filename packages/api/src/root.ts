import { healthRouter } from "./routers/health";
import { issuesRouter } from "./routers/issues";
import { labelsRouter } from "./routers/labels";
import { statesRouter } from "./routers/states";
import { teamsRouter } from "./routers/teams";
import { router } from "./trpc/trpc";

/**
 * Root router. Every mounted router falls under the registry test
 * (src/routers/registry.test.ts), which walks this router's procedures and
 * enforces the mutation-registry + list contract — a router added here but
 * not registered there fails the coverage check.
 */
export const appRouter = router({
  health: healthRouter,
  issues: issuesRouter,
  teams: teamsRouter,
  states: statesRouter,
  labels: labelsRouter,
});

export type AppRouter = typeof appRouter;
