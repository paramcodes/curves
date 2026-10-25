import { createActivityRepo } from "@curves/db/repos/activity.repo";
import {
  createIssueRepo,
  type IssuePatch,
  type IssueRepo,
  type LifecycleStamps,
  lastIssueOrder,
} from "@curves/db/repos/issue.repo";
import { createWorkflowStateRepo } from "@curves/db/repos/state.repo";
import type { ActivityVerb } from "@curves/domain/activities/activity.types";
import { NotFoundError } from "@curves/domain/core/errors";
import type { StateId } from "@curves/domain/core/ids";
import {
  cycleId,
  issueId,
  labelId,
  milestoneId,
  projectId,
  stateId,
  teamId,
  userId,
} from "@curves/domain/core/ids";
import type { Issue, OrderKey, Priority } from "@curves/domain/issues/issue.types";
import { orderBetween } from "@curves/domain/issues/ordering";
import { applyTransition } from "@curves/domain/issues/state-machine";
import { z } from "zod";
import { assertCanAct } from "../authz";
import { listProcedure } from "../list";
import type { CurvesContext, SafeUser } from "../trpc/context";
import { mutation, protectedProcedure, router } from "../trpc/trpc";

/**
 * The first real router (phase-2 slice 5a) — the pattern every 5b router
 * copies: thin resolvers that validate (zod) → authorize (assertCanAct — the
 * only authz seam) → call repo/domain → map. Business logic belongs in
 * packages/domain or the repos, never here.
 *
 * Activity trail: every mutation records one activity per changed field that
 * the domain taxonomy has a verb for (activity.types.ts). Three changes have
 * NO verb in the closed taxonomy and therefore record nothing rather than
 * fabricating one: pure order reorders (move without a state change),
 * archive/unarchive, and description/estimate/parent/milestone edits.
 * Extending the taxonomy is a domain decision, not a router one.
 *
 * State transitions: every stateId change (update and move) goes through the
 * DOMAIN state machine — applyTransition validates the category transition
 * (illegal ones throw TransitionNotAllowedError → BAD_REQUEST via the
 * existing map; note same-category moves between two states are also illegal
 * per canTransition) and computes the sticky lifecycle stamps, which the
 * router passes through to the repo verbatim. The repo never derives stamps
 * itself. Wall clock: `new Date()` is read HERE, in the router, and handed to
 * the pure domain explicitly — routers are the only impure layer.
 */

type Ctx = CurvesContext & { user: SafeUser };

const idString = z.string().min(1);
const prioritySchema = z
  .number()
  .int()
  .min(0)
  .max(4)
  .transform((n) => n as Priority);

const issueInput = {
  title: z.string().min(1).max(255),
  teamId: idString.transform(teamId),
  stateId: idString.transform(stateId),
  priority: prioritySchema,
  description: z.string().default(""),
  assigneeId: idString.transform(userId).nullish(),
  labelIds: z.array(idString.transform(labelId)).max(50).optional(),
  projectId: idString.transform(projectId).nullish(),
  milestoneId: idString.transform(milestoneId).nullish(),
  cycleId: idString.transform(cycleId).nullish(),
  estimate: z.number().int().nullish(),
};

/** Load (or 404) then authorize on the issue's OWN team — the row, not the request, scopes the check. */
const loadForMutation = async (
  ctx: Ctx,
  repo: IssueRepo,
  id: ReturnType<typeof issueId>,
): Promise<Issue> => {
  const issue = await repo.byId(id);
  if (issue === null) {
    throw new NotFoundError(`issue ${id} not found`);
  }
  await assertCanAct(ctx, "update", { teamId: issue.teamId });
  return issue;
};

const record = async (
  ctx: Ctx,
  verb: ActivityVerb,
  entityId: ReturnType<typeof issueId>,
  payload: unknown,
): Promise<void> => {
  await createActivityRepo(ctx.db).record({
    actorId: ctx.user.id,
    verb,
    entityType: "issue",
    entityId,
    payload,
  });
};

/**
 * The ONLY path a state change takes: validate the category transition and
 * compute the sticky lifecycle stamps via the domain state machine, producing
 * the patch fragment to persist alongside the stateId. Both state rows are
 * loaded (the to-state 404s if it does not exist; a from-state missing on a
 * persisted issue is corrupt data and 404s too); applyTransition additionally
 * rejects same-team violations and illegal/same-category transitions.
 * `now` comes from the router's wall clock — domain stays pure.
 */
const transitionStamps = async (
  ctx: Ctx,
  before: Issue,
  toStateId: StateId,
  now: Date,
): Promise<LifecycleStamps> => {
  const states = createWorkflowStateRepo(ctx.db);
  const fromState = await states.byId(before.stateId);
  if (fromState === null) {
    throw new NotFoundError(`state ${before.stateId} not found`);
  }
  const toState = await states.byId(toStateId);
  if (toState === null) {
    throw new NotFoundError(`state ${toStateId} not found`);
  }
  const stamped = applyTransition(before, fromState, toState, now);
  return {
    startedAt: stamped.startedAt,
    completedAt: stamped.completedAt,
    canceledAt: stamped.canceledAt,
    updatedAt: stamped.updatedAt,
  };
};

export const issuesRouter = router({
  byId: protectedProcedure
    .input(z.object({ id: idString.transform(issueId) }))
    .query(async ({ ctx, input }) => {
      const issue = await createIssueRepo(ctx.db).byId(input.id);
      if (issue === null) {
        throw new NotFoundError(`issue ${input.id} not found`);
      }
      return issue;
    }),

  // Workspace v1: any signed-in user may read; the filter spec scopes (e.g. key "team").
  list: listProcedure((ctx, query) => createIssueRepo(ctx.db).list(query)),

  relations: protectedProcedure
    .input(z.object({ id: idString.transform(issueId) }))
    .query(async ({ ctx, input }) => {
      const repo = createIssueRepo(ctx.db);
      const issue = await repo.byId(input.id);
      if (issue === null) {
        throw new NotFoundError(`issue ${input.id} not found`);
      }
      return repo.relations(input.id);
    }),

  create: mutation(
    protectedProcedure.input(z.object(issueInput)).mutation(async ({ ctx, input }) => {
      await assertCanAct(ctx, "create", { teamId: input.teamId });
      const repo = createIssueRepo(ctx.db);
      // Append allocation, same scheme as the seed: after the team's current
      // last order key. nextNumber is NOT needed — repo.create allocates the
      // number inside its own transaction (ADR 0006).
      const order = orderBetween(await lastIssueOrder(ctx.db, input.teamId), null);
      const issue = await repo.create(
        {
          teamId: input.teamId,
          title: input.title,
          description: input.description,
          stateId: input.stateId,
          priority: input.priority,
          estimate: input.estimate ?? null,
          assigneeId: input.assigneeId ?? null,
          creatorId: ctx.user.id,
          projectId: input.projectId ?? null,
          milestoneId: input.milestoneId ?? null,
          cycleId: input.cycleId ?? null,
          labelIds: input.labelIds ?? [],
        },
        order,
      );
      await record(ctx, "issue_created", issue.id, {
        title: issue.title,
        teamId: issue.teamId,
        number: issue.number,
      });
      return issue;
    }),
  ),

  update: mutation(
    protectedProcedure
      .input(
        z.object({
          id: idString.transform(issueId),
          patch: z.object({
            title: issueInput.title.optional(),
            description: z.string().optional(),
            stateId: issueInput.stateId.optional(),
            priority: prioritySchema.optional(),
            estimate: z.number().int().nullable().optional(),
            assigneeId: issueInput.assigneeId,
            parentId: idString.transform(issueId).nullable().optional(),
            projectId: issueInput.projectId,
            milestoneId: issueInput.milestoneId,
            cycleId: issueInput.cycleId,
          }),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const repo = createIssueRepo(ctx.db);
        const before = await loadForMutation(ctx, repo, input.id);
        const patch: IssuePatch = {};
        const trail: Array<{ verb: ActivityVerb; payload: unknown }> = [];

        /** Copy a defined, actually-changed value into the patch; report whether it changed. */
        const changed = <T>(
          key: keyof IssuePatch & keyof Issue,
          next: T | undefined,
          current: T,
        ): boolean => {
          if (next === undefined || next === current) {
            return false;
          }
          (patch as Record<string, unknown>)[key] = next;
          return true;
        };
        const changedTo = (from: unknown, to: unknown): { from: unknown; to: unknown } => ({
          from,
          to,
        });

        if (changed("title", input.patch.title, before.title)) {
          trail.push({
            verb: "title_changed",
            payload: changedTo(before.title, input.patch.title),
          });
        }
        changed("description", input.patch.description, before.description);
        const nextStateId = input.patch.stateId;
        if (nextStateId !== undefined && nextStateId !== before.stateId) {
          patch.stateId = nextStateId;
          // Router wall clock — handed to the pure state machine explicitly.
          Object.assign(patch, await transitionStamps(ctx, before, nextStateId, new Date()));
          trail.push({
            verb: "state_changed",
            payload: changedTo(before.stateId, nextStateId),
          });
        }
        if (changed("priority", input.patch.priority, before.priority)) {
          trail.push({
            verb: "priority_changed",
            payload: changedTo(before.priority, input.patch.priority),
          });
        }
        changed("estimate", input.patch.estimate, before.estimate);
        if (changed("assigneeId", input.patch.assigneeId, before.assigneeId)) {
          trail.push({
            verb: "assignee_changed",
            payload: changedTo(before.assigneeId, input.patch.assigneeId),
          });
        }
        changed("parentId", input.patch.parentId, before.parentId);
        if (changed("projectId", input.patch.projectId, before.projectId)) {
          trail.push({
            verb: "moved_to_project",
            payload: changedTo(before.projectId, input.patch.projectId),
          });
        }
        changed("milestoneId", input.patch.milestoneId, before.milestoneId);
        if (changed("cycleId", input.patch.cycleId, before.cycleId)) {
          trail.push({
            verb: "moved_to_cycle",
            payload: changedTo(before.cycleId, input.patch.cycleId),
          });
        }

        const after = await repo.update(input.id, patch);
        for (const entry of trail) {
          await record(ctx, entry.verb, after.id, entry.payload);
        }
        return after;
      }),
  ),

  move: mutation(
    protectedProcedure
      .input(
        z.object({
          id: idString.transform(issueId),
          order: idString.transform((s) => s as OrderKey),
          toStateId: idString.transform(stateId).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const repo = createIssueRepo(ctx.db);
        const before = await loadForMutation(ctx, repo, input.id);
        // A state change goes through the domain state machine first; the
        // stamped patch persists in the SAME update as the reorder.
        const stamps =
          input.toStateId !== undefined && input.toStateId !== before.stateId
            ? await transitionStamps(ctx, before, input.toStateId, new Date())
            : undefined;
        const after = await repo.move(input.id, input.order, input.toStateId, stamps);
        if (input.toStateId !== undefined && input.toStateId !== before.stateId) {
          await record(ctx, "state_changed", after.id, { from: before.stateId, to: after.stateId });
        }
        return after;
      }),
  ),

  setLabels: mutation(
    protectedProcedure
      .input(
        z.object({
          id: idString.transform(issueId),
          labelIds: z.array(idString.transform(labelId)).max(50),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const repo = createIssueRepo(ctx.db);
        const before = await loadForMutation(ctx, repo, input.id);
        const after = await repo.setLabels(input.id, input.labelIds);

        const beforeSet = new Set<string>(before.labelIds);
        const afterSet = new Set<string>(after.labelIds);
        for (const id of afterSet) {
          if (!beforeSet.has(id)) await record(ctx, "label_added", after.id, { labelId: id });
        }
        for (const id of beforeSet) {
          if (!afterSet.has(id)) await record(ctx, "label_removed", after.id, { labelId: id });
        }
        return after;
      }),
  ),

  archive: mutation(
    protectedProcedure
      .input(z.object({ id: idString.transform(issueId), archived: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const repo = createIssueRepo(ctx.db);
        await loadForMutation(ctx, repo, input.id);
        // no taxonomy verb for (un)archiving — see the file comment
        return repo.archive(input.id, input.archived ? new Date() : null);
      }),
  ),
});

/** Registry list: mutation procedure keys in this router (registry-test contract). */
export const mutations = ["create", "update", "move", "setLabels", "archive"] as const;
