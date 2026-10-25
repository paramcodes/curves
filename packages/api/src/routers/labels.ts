import { createLabelRepo } from "@curves/db/repos/label.repo";
import { NotFoundError } from "@curves/domain/core/errors";
import { labelId, teamId } from "@curves/domain/core/ids";
import { z } from "zod";
import { assertCanAct } from "../authz";
import { mutation, protectedProcedure, router } from "../trpc/trpc";

/**
 * Labels are team-scoped. create/update take the "update" action on the team
 * (creating a label is a team-settings-level act, not an issue edit); delete
 * takes "delete". Rename collisions surface as DuplicateError → CONFLICT via
 * the one mapping table (ERRORS.md).
 */
export const labelsRouter = router({
  byTeam: protectedProcedure
    .input(z.object({ teamId: z.string().min(1).transform(teamId) }))
    .query(({ ctx, input }) => createLabelRepo(ctx.db).byTeam(input.teamId)),

  create: mutation({
    input: z.object({
      teamId: z.string().min(1).transform(teamId),
      name: z.string().min(1).max(60),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "color must be a #rrggbb hex string"),
    }),
    // Team-settings-level act, not an issue edit → the "update" action.
    authorize: (ctx, input) => assertCanAct(ctx, "update", { teamId: input.teamId }),
    resolve: ({ ctx, input }) => createLabelRepo(ctx.db).create(input),
  }),

  update: mutation({
    input: z.object({
      id: z.string().min(1).transform(labelId),
      name: z.string().min(1).max(60),
    }),
    authorize: async (ctx, input) => {
      const label = await createLabelRepo(ctx.db).byId(input.id);
      if (label === null) {
        throw new NotFoundError(`label ${input.id} not found`);
      }
      await assertCanAct(ctx, "update", { teamId: label.teamId });
    },
    resolve: async ({ ctx, input }) => {
      const repo = createLabelRepo(ctx.db);
      const label = await repo.byId(input.id);
      if (label === null) {
        throw new NotFoundError(`label ${input.id} not found`);
      }
      await repo.rename(input.id, input.name);
      return { ...label, name: input.name };
    },
  }),

  remove: mutation({
    input: z.object({ id: z.string().min(1).transform(labelId) }),
    authorize: async (ctx, input) => {
      const label = await createLabelRepo(ctx.db).byId(input.id);
      if (label === null) {
        throw new NotFoundError(`label ${input.id} not found`);
      }
      await assertCanAct(ctx, "delete", { teamId: label.teamId });
    },
    resolve: async ({ ctx, input }) => {
      const repo = createLabelRepo(ctx.db);
      const label = await repo.byId(input.id);
      if (label === null) {
        throw new NotFoundError(`label ${input.id} not found`);
      }
      await repo.delete(input.id);
      return label;
    },
  }),
});

/** Registry list: mutation procedure keys in this router (registry-test contract). */
export const mutations = ["create", "update", "remove"] as const;
