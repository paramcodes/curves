import { createActivityRepo } from "@curves/db/repos/activity.repo";
import { cycles } from "@curves/db/schema/cycles";
import { states } from "@curves/db/schema/states";
import { teamMembers } from "@curves/db/schema/team_members";
import { teams } from "@curves/db/schema/teams";
import { createSharedTestDb } from "@curves/db/test-db";
import { cycleId, stateId as stateIdOf, teamId as teamIdOf } from "@curves/domain/core/ids";
import { evaluate } from "@curves/domain/filters/evaluate";
import type { FilterSpec } from "@curves/domain/filters/filter.types";
import type { Issue } from "@curves/domain/issues/issue.types";
import { TRPCError } from "@trpc/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type CurvesAuth, createAuth } from "../auth/better-auth";
import { type AppRouter, appRouter } from "../root";
import type { SafeUser } from "../trpc/context";
import { createContext, createTestContext } from "../trpc/context";

/**
 * Slice-5a integration suite: the real root appRouter driven through
 * callers — create→byId→list round-trip, activity verbs per changed field,
 * move, labels diff, archive, zod validation, authz (BAD_REQUEST per
 * ERRORS.md), unauthenticated (UNAUTHORIZED), and a list-vs-evaluate oracle
 * spot-check across the API layer.
 */

let shared: Awaited<ReturnType<typeof createSharedTestDb>>;
let curves: CurvesAuth;

const TEAM = teamIdOf("team_router");

const ST_BACKLOG = stateIdOf("st_router_backlog");
const ST_DOING = stateIdOf("st_router_doing");
const ST_DONE = stateIdOf("st_router_done");
const STATES = [ST_BACKLOG, ST_DOING, ST_DONE];
const CYCLE = cycleId("cyc_router_1");

const stateRows = [
  { id: ST_BACKLOG, teamId: TEAM, name: "Backlog", category: "backlog" as const, position: 0 },
  { id: ST_DOING, teamId: TEAM, name: "In Progress", category: "started" as const, position: 1 },
  { id: ST_DONE, teamId: TEAM, name: "Done", category: "completed" as const, position: 2 },
];

/** Indexed access is modulo the array length at every call site, so this cast is total (the seed's pattern). */
const nth = <T>(xs: readonly T[], i: number): T => xs[i] as T;

const display = {
  groupBy: "none",
  sortBy: "order",
  direction: "asc",
  showSubIssues: false,
} as const;

beforeAll(async () => {
  shared = await createSharedTestDb();
  curves = createAuth(shared.db);
});
afterAll(async () => {
  await shared.close();
});
beforeEach(async () => {
  await shared.reset();
  await shared.db.insert(teams).values({ id: TEAM, key: "RTR", name: "Router Team" });
  await shared.db.insert(states).values(stateRows);
  const day = 86_400_000;
  const now = Date.now();
  await shared.db.insert(cycles).values({
    id: CYCLE,
    teamId: TEAM,
    number: 1,
    startsAt: new Date(now - day),
    endsAt: new Date(now + 13 * day),
  });
});

/** Admin member + a second signed-in user who is NOT a member of TEAM. */
const memberAndOutsider = async (): Promise<{
  member: {
    context: Awaited<ReturnType<typeof createContext>> & { user: SafeUser };
    user: SafeUser;
  };
  outsider: {
    context: Awaited<ReturnType<typeof createContext>> & { user: SafeUser };
    user: SafeUser;
  };
}> => {
  const member = await createTestContext(shared.db, curves);
  const outsider = await createTestContext(shared.db, curves);
  await shared.db
    .insert(teamMembers)
    .values({ teamId: TEAM, userId: member.user.id, role: "admin" });
  return { member, outsider };
};

const callerFor = (
  ctx: Awaited<ReturnType<typeof createContext>>,
): ReturnType<AppRouter["createCaller"]> => appRouter.createCaller(ctx);

describe("issues happy path", () => {
  it("create → byId round-trip: fields, per-team number, append order, issue_created activity", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);

    const first = await caller.issues.create({
      title: "First issue",
      teamId: TEAM,
      stateId: ST_BACKLOG,
      priority: 2,
      description: "created through the API",
      estimate: 3,
    });
    expect(first.title).toBe("First issue");
    expect(first.teamId).toBe(TEAM);
    expect(first.number).toBe(1);
    expect(first.order).toBe("0");
    expect(first.creatorId).toBe(member.user.id);
    expect(first.description).toBe("created through the API");
    expect(first.estimate).toBe(3);

    const second = await caller.issues.create({
      title: "Second issue",
      teamId: TEAM,
      stateId: ST_DOING,
      priority: 1,
    });
    expect(second.number).toBe(2);
    expect(second.order).toBe("1");

    const loaded = await caller.issues.byId({ id: first.id });
    expect(loaded).toEqual(first);

    const trail = await createActivityRepo(shared.db).byEntity("issue", first.id);
    expect(trail.map((a) => a.verb)).toEqual(["issue_created"]);
    expect(nth(trail, 0).actorId).toBe(member.user.id);
    expect(nth(trail, 0).payload).toEqual({ title: "First issue", teamId: TEAM, number: 1 });
  });

  it("list: filter by team key, cursor plumbing, groupCounts over the whole filtered set", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);
    for (const title of ["a", "b", "c"]) {
      await caller.issues.create({ title, teamId: TEAM, stateId: ST_BACKLOG, priority: 3 });
    }

    const page = await caller.issues.list({
      filter: { kind: "cond", key: "team", op: "eq", value: TEAM },
      display,
      cursor: null,
      limit: 2,
    });
    expect(page.items.map((i) => i.title)).toEqual(["a", "b"]);
    expect(page.nextCursor).not.toBeNull();
    expect(page.groupCounts).toEqual([{ key: "all", count: 3 }]);

    const secondPage = await caller.issues.list({
      filter: { kind: "cond", key: "team", op: "eq", value: TEAM },
      display,
      cursor: page.nextCursor,
      limit: 2,
    });
    expect(secondPage.items.map((i) => i.title)).toEqual(["c"]);
    expect(secondPage.nextCursor).toBeNull();
  });
});

describe("issue mutations write the right activity verbs", () => {
  it("update records title_changed / priority_changed / moved_to_cycle per changed field and nothing for equal values", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);
    const issue = await caller.issues.create({
      title: "Original",
      teamId: TEAM,
      stateId: ST_BACKLOG,
      priority: 1,
      cycleId: null,
    });

    const updated = await caller.issues.update({
      id: issue.id,
      patch: { title: "Renamed", priority: 4, cycleId: CYCLE, description: issue.description },
    });
    expect(updated.title).toBe("Renamed");
    expect(updated.priority).toBe(4);
    expect(updated.cycleId).toBe(CYCLE);

    const trail = await createActivityRepo(shared.db).byEntity("issue", issue.id);
    // issue_created + exactly the three taxonomy verbs for the changed fields;
    // the no-op description "change" records nothing. Entries within one
    // millisecond tie on id (random UUIDs), so order is compared as a multiset.
    expect(trail.map((a) => a.verb).sort()).toEqual(
      ["issue_created", "title_changed", "priority_changed", "moved_to_cycle"].sort(),
    );
    expect(trail.find((a) => a.verb === "title_changed")?.payload).toEqual({
      from: "Original",
      to: "Renamed",
    });
  });

  it("move changes the order key; with toStateId it also changes state and records state_changed", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);
    const issue = await caller.issues.create({
      title: "Movable",
      teamId: TEAM,
      stateId: ST_BACKLOG,
      priority: 0,
    });

    const reordered = await caller.issues.move({ id: issue.id, order: "42.5" });
    expect(reordered.order).toBe("42.5");
    expect(
      (await createActivityRepo(shared.db).byEntity("issue", issue.id)).map((a) => a.verb),
    ).toEqual(["issue_created"]);

    const moved = await caller.issues.move({ id: issue.id, order: "43", toStateId: ST_DONE });
    expect(moved.stateId).toBe(ST_DONE);
    const trail = await createActivityRepo(shared.db).byEntity("issue", issue.id);
    expect(nth(trail, 0).verb).toBe("state_changed");
    expect(nth(trail, 0).payload).toEqual({ from: ST_BACKLOG, to: ST_DONE });
  });

  it("setLabels diffs old vs new into label_added / label_removed entries", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);
    // real label rows (FK) — created through the labels router itself
    const keep = await caller.labels.create({ teamId: TEAM, name: "keep", color: "#00ff00" });
    const drop = await caller.labels.create({ teamId: TEAM, name: "drop", color: "#ff0000" });
    const add = await caller.labels.create({ teamId: TEAM, name: "add", color: "#0000ff" });

    const issue = await caller.issues.create({
      title: "Labelled",
      teamId: TEAM,
      stateId: ST_BACKLOG,
      priority: 0,
      labelIds: [keep.id, drop.id],
    });

    const after = await caller.issues.setLabels({ id: issue.id, labelIds: [keep.id, add.id] });
    expect([...after.labelIds].sort()).toEqual([add.id, keep.id].sort());

    const trail = await createActivityRepo(shared.db).byEntity("issue", issue.id);
    expect(trail.map((a) => a.verb).sort()).toEqual(
      ["issue_created", "label_removed", "label_added"].sort(),
    );
    expect(trail.find((a) => a.verb === "label_removed")?.payload).toEqual({ labelId: drop.id });
    expect(trail.find((a) => a.verb === "label_added")?.payload).toEqual({ labelId: add.id });
  });

  it("archive stamps archivedAt; unarchive clears it", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);
    const issue = await caller.issues.create({
      title: "Archivable",
      teamId: TEAM,
      stateId: ST_BACKLOG,
      priority: 0,
    });

    const archived = await caller.issues.archive({ id: issue.id, archived: true });
    expect(archived.archivedAt).toBeInstanceOf(Date);
    const unarchived = await caller.issues.archive({ id: issue.id, archived: false });
    expect(unarchived.archivedAt).toBeNull();
  });
});

describe("gates", () => {
  it("bad input is BAD_REQUEST from zod — priority 9 is outside the 0–4 priority vocabulary", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);
    const err = await caller.issues
      .create({ title: "x", teamId: TEAM, stateId: ST_BACKLOG, priority: 9 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("BAD_REQUEST");
    expect((err as TRPCError).message).toMatch(/priority/i);
  });

  it("a non-member creating in a team is BAD_REQUEST (authz → ValidationError per ERRORS.md)", async () => {
    const { outsider } = await memberAndOutsider();
    const caller = callerFor(outsider.context);
    const err = await caller.issues
      .create({ title: "hostile", teamId: TEAM, stateId: ST_BACKLOG, priority: 1 })
      .catch((e: unknown) => e);
    expect((err as TRPCError).code).toBe("BAD_REQUEST");
    expect((err as TRPCError).cause).toBeInstanceOf(Error);
    expect((err as TRPCError).message).toMatch(/not a member/i);
  });

  it("an anonymous caller gets UNAUTHORIZED on every procedure shape", async () => {
    const anonymous = await createContext({ db: shared.db, auth: curves, headers: new Headers() });
    const anonCaller = callerFor(anonymous);
    await expect(anonCaller.issues.byId({ id: "issue_x" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      anonCaller.issues.list({
        filter: { kind: "cond", key: "team", op: "eq", value: TEAM },
        display,
        cursor: null,
        limit: 10,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      anonCaller.issues.create({ title: "x", teamId: TEAM, stateId: ST_BACKLOG, priority: 1 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("mutating an issue in another team is rejected by the issue's OWN team scope, not the caller's", async () => {
    const { member, outsider } = await memberAndOutsider();
    const memberCaller = callerFor(member.context);
    const issue = await memberCaller.issues.create({
      title: "member-owned",
      teamId: TEAM,
      stateId: ST_BACKLOG,
      priority: 1,
    });

    const outsiderCaller = callerFor(outsider.context);
    await expect(
      outsiderCaller.issues.update({ id: issue.id, patch: { title: "hijacked" } }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("list-vs-evaluate oracle through the API layer", () => {
  it("the API list result equals domain evaluate() over the same rows", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);
    const created: Issue[] = [];
    for (const [i, p] of [0, 1, 2, 3, 4, 1, 3].entries()) {
      created.push(
        await caller.issues.create({
          title: `oracle-${i}`,
          teamId: TEAM,
          stateId: nth(STATES, i % STATES.length),
          priority: p,
        }),
      );
    }

    const spec: FilterSpec = {
      kind: "group",
      op: "or",
      children: [
        { kind: "cond", key: "priority", op: "eq", value: 1 },
        { kind: "cond", key: "priority", op: "gte", value: 3 },
      ],
    };
    const listed = await caller.issues.list({ filter: spec, display, cursor: null, limit: 100 });

    const expected = new Set(created.filter((issue) => evaluate(spec, issue)).map((i) => i.id));
    expect(new Set(listed.items.map((i) => i.id))).toEqual(expected);
    // and the pure evaluator agrees the rejected rows are out
    expect(expected.size).toBe(5);
  });
});

describe("teams/labels/states through the API", () => {
  it("createTeam (workspace scope) → byKey; duplicate key is CONFLICT; labels create/rename/remove; states byTeam", async () => {
    const { member, outsider } = await memberAndOutsider();
    const caller = callerFor(member.context);

    const team = await caller.teams.create({ key: "OPS", name: "Operations" });
    expect(team.key).toBe("OPS");
    await expect(caller.teams.byKey({ key: "OPS" })).resolves.toEqual(team);

    // duplicate team key → DuplicateError → CONFLICT via the mapping table
    await expect(caller.teams.create({ key: "OPS", name: "Again" })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    // NOTE: createTeam intentionally adds no membership rows yet — team setup
    // (invites/members) is a later slice. Labels below therefore act on TEAM,
    // where the test member IS a member; a fresh API-created team would
    // reject everything until a membership row exists (documented gap).
    const label = await caller.labels.create({ teamId: TEAM, name: "bug", color: "#ff0000" });
    await expect(caller.labels.byTeam({ teamId: TEAM })).resolves.toEqual([label]);
    await expect(caller.labels.update({ id: label.id, name: "defect" })).resolves.toMatchObject({
      name: "defect",
    });
    await expect(caller.labels.remove({ id: label.id })).resolves.toMatchObject({ id: label.id });
    await expect(caller.labels.byTeam({ teamId: TEAM })).resolves.toEqual([]);

    await expect(caller.states.byTeam({ teamId: TEAM })).resolves.toHaveLength(3);

    // outsider (signed in, not a member) cannot create a label in the team
    const outsiderCaller = callerFor(outsider.context);
    await expect(
      outsiderCaller.labels.create({ teamId: TEAM, name: "nope", color: "#00ff00" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
