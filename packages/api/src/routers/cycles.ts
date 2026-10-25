import { createCycleRepo } from "@curves/db/repos/cycle.repo";
import { teamId } from "@curves/domain/core/ids";
import type { Cycle } from "@curves/domain/cycles/cycle.types";
import { classifyCycle } from "@curves/domain/cycles/cycle-math";
import { z } from "zod";
import { assertCanAct } from "../authz";
import { mutation, protectedProcedure, router } from "../trpc/trpc";

/**
 * Cycles are team-scoped. Reads are signed-in (workspace v1 read policy);
 * create is a workflow-shaping act gated on the team ADMIN via
 * assertCanAct("manage_workflow") — the action states.ts reserves for the
 * Phase 5 workflow editor, since a cycle schedule is part of the team's
 * working agreement in the same sense.
 *
 * number/startsAt/endsAt are EXPLICIT inputs: Phase 5 owns the auto-schedule
 * policy (rollover job + cadence defaults, docs/phases/05), so the API does
 * not guess numbers or dates here. The repo enforces startsAt < endsAt
 * (ValidationError → BAD_REQUEST) and (teamId, number) uniqueness
 * (DuplicateError → CONFLICT).
 *
 * byTeam classifies each cycle via the PURE domain classifyCycle — the router
 * is the impure layer that reads wall clock `new Date()` and hands it in.
 */
export const cyclesRouter = router({
  byTeam: protectedProcedure
    .input(z.object({ teamId: z.string().min(1).transform(teamId) }))
    .query(async ({ ctx, input }) => {
      const now = new Date(); // router wall clock; classifyCycle stays pure
      const cycles: Cycle[] = await createCycleRepo(ctx.db).byTeam(input.teamId);
      return cycles.map((cycle) => ({ cycle, phase: classifyCycle(cycle, now) }));
    }),

  create: mutation(
    protectedProcedure
      .input(
        z.object({
          teamId: z.string().min(1).transform(teamId),
          number: z.number().int().min(1),
          startsAt: z.coerce.date(),
          endsAt: z.coerce.date(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertCanAct(ctx, "manage_workflow", { teamId: input.teamId });
        return createCycleRepo(ctx.db).create(input);
      }),
  ),
});

/** Registry list: mutation procedure keys in this router (registry-test contract). */
export const mutations = ["create"] as const;
