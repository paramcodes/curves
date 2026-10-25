import { createProjectRepo } from "@curves/db/repos/project.repo";
import { NotFoundError } from "@curves/domain/core/errors";
import { projectId, userId } from "@curves/domain/core/ids";
import { z } from "zod";
import { assertCanAct } from "../authz";
import { mutation, protectedProcedure, router } from "../trpc/trpc";

/**
 * Projects are WORKSPACE-scoped in v1 — they cross teams (issues from any
 * team can join a project), so every procedure takes { workspace: true } at
 * the single authz seam; a workspace role tiers in without touching routers.
 *
 * NO ACTIVITY WRITES, deliberately: the closed ActivityVerb taxonomy has no
 * project verbs ("moved_to_project" et al. are issue-entity verbs), so
 * project create/update record nothing rather than fabricating one.
 * Extending the taxonomy is a domain decision (activity.types.ts).
 *
 * status/health are NOT patchable here: the repo accepts them, but their
 * transitions are domain policy that lands with Phase 4 (rollups/health) —
 * exposing them now would let callers bypass that policy the day it exists.
 */
export const projectsRouter = router({
  /** Ordered by name (repo contract) — the projects index. */
  list: protectedProcedure.query(({ ctx }) => createProjectRepo(ctx.db).list()),

  byId: protectedProcedure
    .input(z.object({ id: z.string().min(1).transform(projectId) }))
    .query(async ({ ctx, input }) => {
      const project = await createProjectRepo(ctx.db).byId(input.id);
      if (project === null) {
        throw new NotFoundError(`project ${input.id} not found`);
      }
      return project;
    }),

  create: mutation({
    input: z.object({
      name: z.string().min(1).max(255),
      description: z.string().max(10_000).default(""),
      leadId: z.string().min(1).transform(userId).nullish(),
      targetDate: z.coerce.date().nullish(),
    }),
    // Workspace scope in v1 — a finer workspace role tiers in at the authz
    // seam without touching this resolver.
    authorize: (ctx) => assertCanAct(ctx, "create", { workspace: true }),
    resolve: ({ ctx, input }) =>
      createProjectRepo(ctx.db).create({
        name: input.name,
        description: input.description,
        leadId: input.leadId ?? null,
        targetDate: input.targetDate ?? null,
      }),
  }),

  update: mutation({
    input: z.object({
      id: z.string().min(1).transform(projectId),
      patch: z.object({
        name: z.string().min(1).max(255).optional(),
        description: z.string().max(10_000).optional(),
        leadId: z.string().min(1).transform(userId).nullish(),
        targetDate: z.coerce.date().nullish(),
      }),
    }),
    authorize: (ctx) => assertCanAct(ctx, "update", { workspace: true }),
    resolve: ({ ctx, input }) => {
      const patch: Parameters<ReturnType<typeof createProjectRepo>["update"]>[1] = {};
      if (input.patch.name !== undefined) patch.name = input.patch.name;
      if (input.patch.description !== undefined) patch.description = input.patch.description;
      if (input.patch.leadId !== undefined) patch.leadId = input.patch.leadId;
      if (input.patch.targetDate !== undefined) patch.targetDate = input.patch.targetDate;
      // repo.update 404s (NotFoundError → NOT_FOUND) when the project is gone
      return createProjectRepo(ctx.db).update(input.id, patch);
    },
  }),
});

/** Registry list: mutation procedure keys in this router (registry-test contract). */
export const mutations = ["create", "update"] as const;
