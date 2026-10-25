import type { inferRouterOutputs } from "@trpc/server";
import { commentsRouter } from "./routers/comments";
import { cyclesRouter } from "./routers/cycles";
import { healthRouter } from "./routers/health";
import { issuesRouter } from "./routers/issues";
import { labelsRouter } from "./routers/labels";
import { milestonesRouter } from "./routers/milestones";
import { notificationsRouter } from "./routers/notifications";
import { projectsRouter } from "./routers/projects";
import { statesRouter } from "./routers/states";
import { teamsRouter } from "./routers/teams";
import { usersRouter } from "./routers/users";
import { viewsRouter } from "./routers/views";
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
  projects: projectsRouter,
  milestones: milestonesRouter,
  cycles: cyclesRouter,
  comments: commentsRouter,
  views: viewsRouter,
  notifications: notificationsRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;

/** Inferred output types of every procedure — the contract web consumes (type-only). */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
