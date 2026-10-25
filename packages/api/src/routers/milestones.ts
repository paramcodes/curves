import { createMilestoneRepo } from "@curves/db/repos/milestone.repo";
import { createProjectRepo } from "@curves/db/repos/project.repo";
import { NotFoundError } from "@curves/domain/core/errors";
import { milestoneId, projectId } from "@curves/domain/core/ids";
import { z } from "zod";
import { assertCanAct } from "../authz";
import { mutation, protectedProcedure, router } from "../trpc/trpc";

/**
 * Milestones belong to a project, and projects are workspace-scoped in v1
 * (see projects.ts) — so these procedures are workspace-scoped at the single
 * authz seam too. `position` is caller-managed ordering (repo contract: not
 * unique, id breaks ties) and is REQUIRED on create — the API invents no
 * positioning policy of its own.
 *
 * Like projects: no activity writes (no milestone verbs in the closed
 * taxonomy), and create 404s up front on a missing parent project — the FK
 * alone would surface as an unmapped INTERNAL_SERVER_ERROR instead of
 * NOT_FOUND.
 */
export const milestonesRouter = router({
  /** Ordered by position (repo contract). */
  byProject: protectedProcedure
    .input(z.object({ projectId: z.string().min(1).transform(projectId) }))
    .query(({ ctx, input }) => createMilestoneRepo(ctx.db).byProject(input.projectId)),

  create: mutation(
    protectedProcedure
      .input(
        z.object({
          projectId: z.string().min(1).transform(projectId),
          name: z.string().min(1).max(120),
          targetDate: z.coerce.date().nullish(),
          position: z.number().int().min(0),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertCanAct(ctx, "create", { workspace: true });
        const project = await createProjectRepo(ctx.db).byId(input.projectId);
        if (project === null) {
          throw new NotFoundError(`project ${input.projectId} not found`);
        }
        return createMilestoneRepo(ctx.db).create({
          projectId: input.projectId,
          name: input.name,
          targetDate: input.targetDate ?? null,
          position: input.position,
        });
      }),
  ),

  update: mutation(
    protectedProcedure
      .input(
        z.object({
          id: z.string().min(1).transform(milestoneId),
          patch: z.object({
            name: z.string().min(1).max(120).optional(),
            targetDate: z.coerce.date().nullish(),
            position: z.number().int().min(0).optional(),
          }),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertCanAct(ctx, "update", { workspace: true });
        const patch: Parameters<ReturnType<typeof createMilestoneRepo>["update"]>[1] = {};
        if (input.patch.name !== undefined) patch.name = input.patch.name;
        if (input.patch.targetDate !== undefined) patch.targetDate = input.patch.targetDate;
        if (input.patch.position !== undefined) patch.position = input.patch.position;
        // repo.update 404s (NotFoundError → NOT_FOUND) when the milestone is gone
        return createMilestoneRepo(ctx.db).update(input.id, patch);
      }),
  ),
});

/** Registry list: mutation procedure keys in this router (registry-test contract). */
export const mutations = ["create", "update"] as const;
