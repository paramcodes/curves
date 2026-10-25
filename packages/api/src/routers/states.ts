import { createWorkflowStateRepo } from "@curves/db/repos/state.repo";
import { teamId } from "@curves/domain/core/ids";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc/trpc";

/**
 * READ-ONLY BY DESIGN (for now): workflow states are created and edited by
 * the workflow editor — Phase 5 task 1 — which owns position/category rules
 * and rebalancing. Until then the state repo exposes no mutations, so this
 * router has none either; when the editor lands its mutations go through the
 * same mutation() + assertCanAct("manage_workflow") pattern (slice-4's
 * ADMIN_ONLY_ACTIONS already reserves the action).
 */
export const statesRouter = router({
  byTeam: protectedProcedure
    .input(z.object({ teamId: z.string().min(1).transform(teamId) }))
    .query(({ ctx, input }) => createWorkflowStateRepo(ctx.db).byTeam(input.teamId)),
});

/** Registry list: mutation procedure keys in this router — none, read-only. */
export const mutations = [] as const;
