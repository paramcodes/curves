import type { AnyMutationProcedure } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { appRouter } from "../root";
import { MUTATION_TAG, mutation, protectedProcedure, type TaggedMutation } from "../trpc/trpc";
import { mutations as commentsMutations, commentsRouter } from "./comments";
import { mutations as cyclesMutations, cyclesRouter } from "./cycles";
import { mutations as healthMutations, healthRouter } from "./health";
import { mutations as issuesMutations, issuesRouter } from "./issues";
import { mutations as labelsMutations, labelsRouter } from "./labels";
import { mutations as milestonesMutations, milestonesRouter } from "./milestones";
import { mutations as notificationsMutations, notificationsRouter } from "./notifications";
import { mutations as projectsMutations, projectsRouter } from "./projects";
import { mutations as statesMutations, statesRouter } from "./states";
import { mutations as teamsMutations, teamsRouter } from "./teams";
import { mutations as usersMutations, usersRouter } from "./users";
import { mutations as viewsMutations, viewsRouter } from "./views";

/**
 * The mutation-registry reflection test (phase-2 task 4).
 *
 * Contract every router module must satisfy:
 *   1. Mutations are built ONLY through `mutation(...)` from trpc.ts — the
 *      walker below fails on any mutation procedure missing the tag, so a
 *      raw `.mutation()` call cannot ship.
 *   2. Each router exports a `mutations` list of its mutation keys; the test
 *      cross-checks it against the actual tagged procedures in both
 *      directions.
 *   3. Every router mounted in root.ts is registered in `mounts` below — a
 *      router added to root but not to `mounts` fails the coverage check, so
 *      it cannot silently escape rules 1 and 2.
 *
 * A deliberate bite (raw `.mutation()` in health.ts) was run once and failed
 * this file before being removed — the transcript line lives in the slice-4
 * report (docs/phases/reports/).
 */

// Procedures are (async) functions in v11, not plain objects — verified
// against the installed @trpc/server 11.19.0.
const isTagged = (value: unknown): boolean =>
  (typeof value === "object" || typeof value === "function") &&
  value !== null &&
  MUTATION_TAG in value;

type ProcedureLike = { _def: { type: string } };

const procedureEntries = (): Array<[string, ProcedureLike]> =>
  // v11 types the record through the decorated (non-flat) router shape; the
  // runtime record is flat procedures with `_def.type` — verified against the
  // installed @trpc/server 11.19.0.
  Object.entries(appRouter._def.procedures) as unknown as Array<[string, ProcedureLike]>;

const routerProcedures = (mounted: {
  _def: { procedures: Record<string, unknown> };
}): Array<[string, ProcedureLike]> =>
  Object.entries(mounted._def.procedures) as Array<[string, ProcedureLike]>;

/** Mount table mirrors root.ts — rule 3 keeps the two in lockstep. */
const mounts = [
  { prefix: "health", router: healthRouter, mutations: healthMutations },
  { prefix: "issues", router: issuesRouter, mutations: issuesMutations },
  { prefix: "teams", router: teamsRouter, mutations: teamsMutations },
  { prefix: "states", router: statesRouter, mutations: statesMutations },
  { prefix: "labels", router: labelsRouter, mutations: labelsMutations },
  { prefix: "projects", router: projectsRouter, mutations: projectsMutations },
  { prefix: "milestones", router: milestonesRouter, mutations: milestonesMutations },
  { prefix: "cycles", router: cyclesRouter, mutations: cyclesMutations },
  { prefix: "comments", router: commentsRouter, mutations: commentsMutations },
  { prefix: "views", router: viewsRouter, mutations: viewsMutations },
  { prefix: "notifications", router: notificationsRouter, mutations: notificationsMutations },
  { prefix: "users", router: usersRouter, mutations: usersMutations },
] as const;

const taggedMutationKeys = (prefix: string): string[] =>
  procedureEntries()
    .filter(
      ([key, proc]) =>
        key.startsWith(`${prefix}.`) && proc._def.type === "mutation" && isTagged(proc),
    )
    .map(([key]) => key);

const setDifference = (a: Set<string>, b: Set<string>): string[] =>
  [...a].filter((key) => !b.has(key));

describe("mutation registry", () => {
  it("every procedure in appRouter is a query or a tagged mutation", () => {
    const violations: string[] = [];
    for (const [key, proc] of procedureEntries()) {
      if (proc._def.type === "query") continue;
      if (proc._def.type === "mutation" && isTagged(proc)) continue;
      violations.push(
        proc._def.type === "mutation"
          ? `"${key}" is an UNTAGGED mutation — build it with mutation() from trpc.ts`
          : `"${key}" is a ${proc._def.type} procedure — subscriptions are out of scope`,
      );
    }
    expect(violations).toEqual([]);
  });

  it("every tagged mutation is declared in its router's mutations list, and every declared key exists", () => {
    const problems: string[] = [];
    for (const { prefix, mutations: declared } of mounts) {
      const actual = new Set(taggedMutationKeys(prefix));
      const expected = new Set(declared.map((m) => `${prefix}.${m}`));

      problems.push(
        ...setDifference(actual, expected).map(
          (key) =>
            `"${key}" is a tagged mutation but missing from ${prefix}'s exported mutations list`,
        ),
      );
      problems.push(
        ...setDifference(expected, actual).map(
          (key) =>
            `"${key}" is declared in ${prefix}'s mutations list but no such tagged mutation exists`,
        ),
      );
    }
    expect(problems).toEqual([]);
  });

  it("every router mounted in appRouter is covered by the mount table above", () => {
    const knownPrefixes = new Set<string>(mounts.map((m) => m.prefix));
    const uncovered: string[] = [];
    let rootLevel = 0;
    for (const key of Object.keys(appRouter._def.procedures)) {
      const dot = key.indexOf(".");
      if (dot === -1) {
        rootLevel += 1;
        continue;
      }
      const prefix = key.slice(0, dot);
      if (!knownPrefixes.has(prefix)) uncovered.push(prefix);
    }
    const problems = [
      ...uncovered.map(
        (p) =>
          `router "${p}" is mounted in root.ts but not registered in registry.test.ts's mounts`,
      ),
      ...(rootLevel > 0
        ? [
            `${rootLevel} root-level procedure(s) — give root its own mount entry in registry.test.ts`,
          ]
        : []),
    ];
    expect(problems).toEqual([]);
  });

  it("every router's exported mutations list matches its own procedure record", () => {
    const problems: string[] = [];
    for (const { prefix, router: mounted, mutations: declared } of mounts) {
      const localMutationKeys = routerProcedures(mounted)
        .filter(([, proc]) => proc._def.type === "mutation")
        .map(([key]) => key);
      if (JSON.stringify([...declared]) !== JSON.stringify(localMutationKeys)) {
        problems.push(
          `${prefix}: exported mutations [${[...declared].join(", ")}] ≠ procedures [${localMutationKeys.join(", ")}]`,
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it("mutation() tags the procedure; raw .mutation() results stay untagged (mechanism proof)", () => {
    const build = (): AnyMutationProcedure =>
      protectedProcedure
        .input(z.object({ value: z.string() }))
        .mutation(async ({ input }) => input.value);

    const tagged: AnyMutationProcedure & TaggedMutation = mutation(build());
    expect(isTagged(tagged)).toBe(true);
    expect(tagged._def.type).toBe("mutation");
    expect(mutation(tagged)).toBe(tagged);

    expect(isTagged(build())).toBe(false);
  });
});
