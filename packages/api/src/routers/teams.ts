import { createTeamRepo } from "@curves/db/repos/team.repo";
import { NotFoundError } from "@curves/domain/core/errors";
import { z } from "zod";
import { assertCanAct } from "../authz";
import { mutation, protectedProcedure, router } from "../trpc/trpc";

/**
 * Teams: workspace-level identity. List/byKey are signed-in reads; create is
 * workspace-scoped (any signed-in user in v1 — assertCanAct is still the
 * single seam, so a finer workspace role slots in without touching routers).
 * Team settings/membership management (update, members) are later-slice
 * mutations and must go through the same mutation() + assertCanAct pattern.
 */
export const teamsRouter = router({
  list: protectedProcedure.query(({ ctx }) => createTeamRepo(ctx.db).list()),

  byKey: protectedProcedure
    .input(z.object({ key: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const team = await createTeamRepo(ctx.db).byKey(input.key);
      if (team === null) {
        throw new NotFoundError(`team "${input.key}" not found`);
      }
      return team;
    }),

  create: mutation(
    protectedProcedure
      .input(
        z.object({
          // Short human-facing code used in issue identifiers ("ENG-101")
          key: z
            .string()
            .min(1)
            .max(10)
            .regex(/^[A-Z][A-Z0-9]*$/, "team key must be uppercase letters/digits, e.g. ENG"),
          name: z.string().min(1).max(100),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertCanAct(ctx, "create", { workspace: true });
        return createTeamRepo(ctx.db).create(input);
      }),
  ),
});

/** Registry list: mutation procedure keys in this router (registry-test contract). */
export const mutations = ["create"] as const;
