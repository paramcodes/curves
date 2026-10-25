import { createViewRepo, type ViewPatch } from "@curves/db/repos/view.repo";
import { NotFoundError } from "@curves/domain/core/errors";
import { type TeamId, teamId, viewId } from "@curves/domain/core/ids";
import { displaySchema, filterSchema } from "@curves/domain/filters/filter.schema";
import { z } from "zod";
import { assertCanAct } from "../authz";
import { mutation, protectedProcedure, router } from "../trpc/trpc";

/**
 * Views are owner-scoped artifacts WITH a team-binding twist: OWNERSHIP
 * (ctx.user) decides which views you may touch at all, but the moment a view
 * is or becomes team-attached it is also a TEAM artifact — attaching,
 * re-pointing, or removing a team view (and setting a team default) shapes
 * the team's shared surface and therefore requires the team-admin
 * "manage_views" action at the single authz seam. Personal views (no teamId)
 * stay purely owner-scoped: no team role is ever consulted for them.
 *
 * Owner isolation is a NOT_FOUND, never FORBIDDEN: another user's view id is
 * indistinguishable from a missing one, so the API cannot be probed for the
 * existence of someone else's views (the authorize gate below is what makes
 * foreign views vanish).
 *
 * authorize loads the row and resolve re-loads it — the two stages share no
 * state (two indexed reads per mutation is the price of a structurally
 * separate authz gate). update goes through the repo's one-team-default
 * transaction (repo contract); filter/display come from the DOMAIN's zod
 * schemas (the one query language, CORE_MODEL §3).
 */

/** Team ids a mutation's team-binding authz must clear: current + target. */
const assertTeamBound = async (
  ctx: Parameters<typeof assertCanAct>[0],
  teams: Iterable<TeamId>,
): Promise<void> => {
  for (const teamId of teams) {
    await assertCanAct(ctx, "manage_views", { teamId });
  }
};

export const viewsRouter = router({
  /** The caller's views — personal and team-scoped (repo contract). */
  my: protectedProcedure.query(({ ctx }) => createViewRepo(ctx.db).byOwner(ctx.user.id)),

  byTeam: protectedProcedure
    .input(z.object({ teamId: z.string().min(1).transform(teamId) }))
    .query(({ ctx, input }) => createViewRepo(ctx.db).byTeam(input.teamId)),

  create: mutation({
    input: z.object({
      name: z.string().min(1).max(120),
      /** null/omitted → a personal view (view.repo contract). */
      teamId: z.string().min(1).transform(teamId).nullish(),
      filter: filterSchema,
      display: displaySchema,
      isTeamDefault: z.boolean().optional(),
    }),
    authorize: (ctx, input) =>
      input.teamId === undefined || input.teamId === null
        ? undefined // personal view: owner-scoped by construction (ownerId = ctx.user)
        : assertTeamBound(ctx, [input.teamId]),
    resolve: ({ ctx, input }) =>
      createViewRepo(ctx.db).create({
        ownerId: ctx.user.id,
        teamId: input.teamId ?? null,
        name: input.name,
        filter: input.filter,
        display: input.display,
        isTeamDefault: input.isTeamDefault ?? false,
      }),
  }),

  update: mutation({
    input: z.object({
      id: z.string().min(1).transform(viewId),
      patch: z.object({
        name: z.string().min(1).max(120).optional(),
        teamId: z.string().min(1).transform(teamId).nullish(),
        filter: filterSchema.optional(),
        display: displaySchema.optional(),
        isTeamDefault: z.boolean().optional(),
      }),
    }),
    authorize: async (ctx, input) => {
      const repo = createViewRepo(ctx.db);
      const view = await repo.byId(input.id);
      if (view === null || view.ownerId !== ctx.user.id) {
        // foreign owner: NOT_FOUND — never a leak, never a FORBIDDEN
        throw new NotFoundError(`view ${input.id} not found`);
      }
      // Team-binding: the view's CURRENT team (leaving it / re-defaulting it)
      // AND the patch's target team (attaching to it) both need manage_views.
      const teams = new Set<TeamId>();
      if (view.teamId !== null) teams.add(view.teamId);
      if (input.patch.teamId !== undefined && input.patch.teamId !== null) {
        teams.add(input.patch.teamId);
      }
      await assertTeamBound(ctx, teams);
    },
    resolve: async ({ ctx, input }) => {
      const repo = createViewRepo(ctx.db);
      const view = await repo.byId(input.id);
      if (view === null) {
        throw new NotFoundError(`view ${input.id} not found`);
      }
      const patch: ViewPatch = {};
      if (input.patch.name !== undefined) patch.name = input.patch.name;
      if (input.patch.teamId !== undefined) patch.teamId = input.patch.teamId;
      if (input.patch.filter !== undefined) patch.filter = input.patch.filter;
      if (input.patch.display !== undefined) patch.display = input.patch.display;
      if (input.patch.isTeamDefault !== undefined) patch.isTeamDefault = input.patch.isTeamDefault;
      return repo.update(input.id, patch);
    },
  }),

  remove: mutation({
    input: z.object({ id: z.string().min(1).transform(viewId) }),
    authorize: async (ctx, input) => {
      const repo = createViewRepo(ctx.db);
      const view = await repo.byId(input.id);
      if (view === null || view.ownerId !== ctx.user.id) {
        throw new NotFoundError(`view ${input.id} not found`);
      }
      if (view.teamId !== null) {
        await assertTeamBound(ctx, [view.teamId]);
      }
    },
    resolve: async ({ ctx, input }) => {
      const repo = createViewRepo(ctx.db);
      const view = await repo.byId(input.id);
      if (view === null) {
        throw new NotFoundError(`view ${input.id} not found`);
      }
      await repo.delete(input.id);
      return view;
    },
  }),
});

/** Registry list: mutation procedure keys in this router (registry-test contract). */
export const mutations = ["create", "update", "remove"] as const;
