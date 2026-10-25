import { createViewRepo, type ViewPatch } from "@curves/db/repos/view.repo";
import { NotFoundError } from "@curves/domain/core/errors";
import { teamId, viewId } from "@curves/domain/core/ids";
import { displaySchema, filterSchema } from "@curves/domain/filters/filter.schema";
import { z } from "zod";
import { mutation, protectedProcedure, router } from "../trpc/trpc";

/**
 * Views are OWNER-SCOPED artifacts, not team settings: create/update/delete
 * are gated on OWNERSHIP (ctx.user), never on team role — a personal view has
 * no team at all, and even a team-scoped view is its owner's to edit.
 * filter/display come from the DOMAIN's zod schemas (the one query language,
 * CORE_MODEL §3) — the API invents no view semantics of its own.
 *
 * Reads split by audience: `my` is the caller's own views; `byTeam` is a
 * signed-in read of a team's shared views.
 *
 * Owner isolation is a NOT-FOUND, never a FORBIDDEN: another user's view id
 * is indistinguishable from a missing one, so the API cannot be probed for
 * the existence of someone else's views. update goes through the repo's
 * one-team-default transaction (repo contract).
 */
export const viewsRouter = router({
  /** The caller's views — personal and team-scoped (repo contract). */
  my: protectedProcedure.query(({ ctx }) => createViewRepo(ctx.db).byOwner(ctx.user.id)),

  byTeam: protectedProcedure
    .input(z.object({ teamId: z.string().min(1).transform(teamId) }))
    .query(({ ctx, input }) => createViewRepo(ctx.db).byTeam(input.teamId)),

  create: mutation(
    protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(120),
          /** null/omitted → a personal view (view.repo contract). */
          teamId: z.string().min(1).transform(teamId).nullish(),
          filter: filterSchema,
          display: displaySchema,
          isTeamDefault: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return createViewRepo(ctx.db).create({
          ownerId: ctx.user.id,
          teamId: input.teamId ?? null,
          name: input.name,
          filter: input.filter,
          display: input.display,
          isTeamDefault: input.isTeamDefault ?? false,
        });
      }),
  ),

  update: mutation(
    protectedProcedure
      .input(
        z.object({
          id: z.string().min(1).transform(viewId),
          patch: z.object({
            name: z.string().min(1).max(120).optional(),
            teamId: z.string().min(1).transform(teamId).nullish(),
            filter: filterSchema.optional(),
            display: displaySchema.optional(),
            isTeamDefault: z.boolean().optional(),
          }),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const repo = createViewRepo(ctx.db);
        const view = await repo.byId(input.id);
        if (view === null || view.ownerId !== ctx.user.id) {
          throw new NotFoundError(`view ${input.id} not found`);
        }
        const patch: ViewPatch = {};
        if (input.patch.name !== undefined) patch.name = input.patch.name;
        if (input.patch.teamId !== undefined) patch.teamId = input.patch.teamId;
        if (input.patch.filter !== undefined) patch.filter = input.patch.filter;
        if (input.patch.display !== undefined) patch.display = input.patch.display;
        if (input.patch.isTeamDefault !== undefined)
          patch.isTeamDefault = input.patch.isTeamDefault;
        return repo.update(input.id, patch);
      }),
  ),

  remove: mutation(
    protectedProcedure
      .input(z.object({ id: z.string().min(1).transform(viewId) }))
      .mutation(async ({ ctx, input }) => {
        const repo = createViewRepo(ctx.db);
        const view = await repo.byId(input.id);
        if (view === null || view.ownerId !== ctx.user.id) {
          throw new NotFoundError(`view ${input.id} not found`);
        }
        await repo.delete(input.id);
        return view;
      }),
  ),
});

/** Registry list: mutation procedure keys in this router (registry-test contract). */
export const mutations = ["create", "update", "remove"] as const;
