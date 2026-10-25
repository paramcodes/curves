import { createActivityRepo } from "@curves/db/repos/activity.repo";
import { createNotificationRepo } from "@curves/db/repos/notification.repo";
import { states as statesSchema } from "@curves/db/schema/states";
import { teamMembers } from "@curves/db/schema/team_members";
import { teams } from "@curves/db/schema/teams";
import { createSharedTestDb } from "@curves/db/test-db";
import { issueId, stateId as stateIdOf, teamId as teamIdOf } from "@curves/domain/core/ids";
import { classifyCycle } from "@curves/domain/cycles/cycle-math";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type CurvesAuth, createAuth } from "../auth/better-auth";
import { type AppRouter, appRouter } from "../root";
import type { SafeUser } from "../trpc/context";
import { createContext, createTestContext } from "../trpc/context";

/**
 * Slice-5b integration suite: projects/milestones/cycles/comments/views/
 * notifications/users through the REAL root appRouter. Per router: one happy
 * path, one validation case, one authz case (non-member / wrong-owner as the
 * router's scope fits). Workspace-scoped routers (projects/milestones) have
 * no non-member case — their gate is existence (NOT_FOUND), not membership.
 */

let shared: Awaited<ReturnType<typeof createSharedTestDb>>;
let curves: CurvesAuth;

const TEAM = teamIdOf("team_5b");
const ST_BACKLOG = stateIdOf("st_5b_backlog");

const day = 86_400_000;

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
  await shared.db.insert(teams).values({ id: TEAM, key: "FVB", name: "Five B Team" });
  await shared.db
    .insert(statesSchema)
    .values([{ id: ST_BACKLOG, teamId: TEAM, name: "Backlog", category: "backlog", position: 0 }]);
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

describe("projects (workspace scope)", () => {
  it("create → byId → list → update round-trip; new projects start planned with no health", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);

    const project = await caller.projects.create({
      name: "Atlas",
      description: "cross-team v1 project",
      targetDate: new Date(Date.now() + 30 * day),
    });
    expect(project.status).toBe("planned");
    expect(project.health).toBeNull();
    await expect(caller.projects.byId({ id: project.id })).resolves.toEqual(project);

    const renamed = await caller.projects.update({
      id: project.id,
      patch: { name: "Atlas II", leadId: member.user.id },
    });
    expect(renamed.name).toBe("Atlas II");
    expect(renamed.leadId).toBe(member.user.id);
    await expect(caller.projects.list()).resolves.toEqual([renamed]);
  });

  it("empty name is BAD_REQUEST from zod; updating a missing project is NOT_FOUND", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);
    await expect(caller.projects.create({ name: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      caller.projects.update({ id: "prj_missing" as never, patch: { name: "x" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("milestones (workspace scope)", () => {
  it("create under a project → byProject in position order → update renames", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);
    const project = await caller.projects.create({ name: "P" });

    const m1 = await caller.milestones.create({
      projectId: project.id,
      name: "MVP",
      position: 0,
    });
    const m2 = await caller.milestones.create({
      projectId: project.id,
      name: "GA",
      position: 1,
      targetDate: new Date(Date.now() + 7 * day),
    });
    await expect(caller.milestones.byProject({ projectId: project.id })).resolves.toEqual([m1, m2]);

    await expect(
      caller.milestones.update({ id: m1.id, patch: { name: "MVP done" } }),
    ).resolves.toMatchObject({ name: "MVP done" });
  });

  it("negative position is BAD_REQUEST; a milestone for a missing project is NOT_FOUND (not a 500)", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);
    await expect(
      caller.milestones.create({ projectId: "prj_x" as never, name: "m", position: -1 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.milestones.create({ projectId: "prj_missing" as never, name: "m", position: 0 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("cycles (team scope, admin-gated create)", () => {
  it("admin creates a cycle; byTeam classifies it via the domain", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);
    const now = Date.now();
    const upcoming = await caller.cycles.create({
      teamId: TEAM,
      number: 2,
      startsAt: new Date(now + 14 * day),
      endsAt: new Date(now + 28 * day),
    });

    const listed = await caller.cycles.byTeam({ teamId: TEAM });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.cycle.id).toBe(upcoming.id);
    expect(listed[0]?.phase).toBe("upcoming");
    // the pure domain classifier agrees under the same boundary rules
    expect(classifyCycle(upcoming, new Date(now + 20 * day))).toBe("current");
  });

  it("endsAt before startsAt is BAD_REQUEST (repo ValidationError)", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);
    const now = Date.now();
    await expect(
      caller.cycles.create({
        teamId: TEAM,
        number: 3,
        startsAt: new Date(now + 10 * day),
        endsAt: new Date(now + 9 * day),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: /startsAt must be before endsAt/ });
  });

  it("a non-member cannot create a cycle in the team (BAD_REQUEST, not a member)", async () => {
    const { outsider } = await memberAndOutsider();
    const caller = callerFor(outsider.context);
    const now = Date.now();
    await expect(
      caller.cycles.create({
        teamId: TEAM,
        number: 4,
        startsAt: new Date(now),
        endsAt: new Date(now + day),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: /not a member/i });
  });
});

describe("comments (the issue's team scopes the write)", () => {
  it("create → byIssue chronological; the issue's trail gains 'commented'", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);
    const issue = await caller.issues.create({
      title: "Commented issue",
      teamId: TEAM,
      stateId: ST_BACKLOG,
      priority: 1,
    });

    const c1 = await caller.comments.create({ issueId: issue.id, body: "first" });
    const c2 = await caller.comments.create({ issueId: issue.id, body: "second" });
    await expect(caller.comments.byIssue({ issueId: issue.id })).resolves.toEqual([c1, c2]);

    const trail = await createActivityRepo(shared.db).byEntity("issue", issue.id);
    expect(trail.map((a) => a.verb).sort()).toEqual(
      ["commented", "commented", "issue_created"].sort(),
    );
    // both comments recorded, payload carries the comment id (newest-first
    // trail, so find() picks an arbitrary one — compare as a set)
    expect(trail.filter((a) => a.verb === "commented").map((a) => a.payload)).toEqual(
      expect.arrayContaining([{ commentId: c1.id }, { commentId: c2.id }]),
    );
  });

  it("empty body is BAD_REQUEST; a non-member cannot comment on the team's issue", async () => {
    const { member, outsider } = await memberAndOutsider();
    const memberCaller = callerFor(member.context);
    const issue = await memberCaller.issues.create({
      title: "Guarded",
      teamId: TEAM,
      stateId: ST_BACKLOG,
      priority: 1,
    });

    await expect(
      memberCaller.comments.create({ issueId: issue.id, body: "" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      callerFor(outsider.context).comments.create({ issueId: issue.id, body: "hostile" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: /not a member/i });
  });
});

describe("views (owner-scoped)", () => {
  const teamFilter = { kind: "cond", key: "team", op: "eq", value: TEAM } as const;

  it("create personal + team-default views → my / byTeam; second default demotes the first", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);

    const personal = await caller.views.create({ name: "Mine", filter: teamFilter, display });
    const teamDefault = await caller.views.create({
      name: "Team board",
      teamId: TEAM,
      filter: teamFilter,
      display,
      isTeamDefault: true,
    });
    // my is ordered by name (repo contract)
    await expect(caller.views.my()).resolves.toEqual([personal, teamDefault]);
    await expect(caller.views.byTeam({ teamId: TEAM })).resolves.toEqual([teamDefault]);

    // promote another default — the repo's one-team-default transaction demotes the first
    const second = await caller.views.create({
      name: "Team list",
      teamId: TEAM,
      filter: teamFilter,
      display,
      isTeamDefault: true,
    });
    const teamViews = await caller.views.byTeam({ teamId: TEAM });
    expect(teamViews.find((v) => v.id === second.id)?.isTeamDefault).toBe(true);
    expect(teamViews.find((v) => v.id === teamDefault.id)?.isTeamDefault).toBe(false);

    await expect(
      caller.views.update({ id: personal.id, patch: { name: "Renamed" } }),
    ).resolves.toMatchObject({ name: "Renamed" });
    await expect(caller.views.remove({ id: second.id })).resolves.toMatchObject({ id: second.id });
    await expect(caller.views.my()).resolves.toHaveLength(2);
  });

  it("another user's view is NOT_FOUND on update/remove and invisible in my — never a leak", async () => {
    const { member, outsider } = await memberAndOutsider();
    const memberCaller = callerFor(member.context);
    const view = await memberCaller.views.create({
      name: "Owned",
      teamId: TEAM,
      filter: teamFilter,
      display,
    });

    const outsiderCaller = callerFor(outsider.context);
    await expect(
      outsiderCaller.views.update({ id: view.id, patch: { name: "hijacked" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(outsiderCaller.views.remove({ id: view.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(outsiderCaller.views.my()).resolves.toEqual([]);
    // but a team's shared views are readable by any signed-in user — and the
    // owner's row survived the failed hijack attempts untouched
    await expect(outsiderCaller.views.byTeam({ teamId: TEAM })).resolves.toEqual([view]);
  });

  it("a filter key outside the domain vocabulary is BAD_REQUEST", async () => {
    const { member } = await memberAndOutsider();
    const caller = callerFor(member.context);
    await expect(
      caller.views.create({
        name: "Bad",
        filter: { kind: "cond", key: "nonsense" as never, op: "eq", value: "x" },
        display,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("TEAM-BINDING authz: a non-member cannot attach views to a team they do not belong to (the review's IDOR repro)", async () => {
    const { outsider } = await memberAndOutsider();
    const outsiderCaller = callerFor(outsider.context);

    // the exact review repro: a signed-in outsider creates a team view for a
    // team they are not a member of — refused by the authorize gate
    await expect(
      outsiderCaller.views.create({
        name: "Hostile",
        teamId: TEAM,
        filter: teamFilter,
        display,
        isTeamDefault: true,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: /not a member/i });
    // nothing leaked into the team's shared surface
    await expect(outsiderCaller.views.byTeam({ teamId: TEAM })).resolves.toEqual([]);
  });

  it("TEAM-BINDING authz: an outsider cannot promote their personal view into another team's default; the team admin can", async () => {
    const { member, outsider } = await memberAndOutsider();
    const outsiderCaller = callerFor(outsider.context);
    // personal view — creating it needs no team role (owner-scoped)
    const personal = await outsiderCaller.views.create({
      name: "Mine",
      filter: teamFilter,
      display,
    });

    // binding it into TEAM's surface requires manage_views on TEAM
    await expect(
      outsiderCaller.views.update({
        id: personal.id,
        patch: { teamId: TEAM, isTeamDefault: true },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: /not a member/i });
    // the failed attempt changed nothing
    await expect(outsiderCaller.views.my()).resolves.toEqual([
      expect.objectContaining({ id: personal.id, teamId: null, isTeamDefault: false }),
    ]);

    // the admin of TEAM CAN bind another owner's... no — ownership still
    // gates: the OUTSIDER owns the view, so even the team admin gets NOT_FOUND
    await expect(
      callerFor(member.context).views.update({
        id: personal.id,
        patch: { teamId: TEAM, isTeamDefault: true },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // and the owner (who is not a member) still cannot bind it — the two
    // gates are cumulative: owner AND team admin, for team-attached views

    // the ALLOWED path: the team admin binds their OWN personal view —
    // ownership and role gates both clear
    const adminView = await callerFor(member.context).views.create({
      name: "Admin's own",
      filter: teamFilter,
      display,
    });
    await expect(
      callerFor(member.context).views.update({
        id: adminView.id,
        patch: { teamId: TEAM, isTeamDefault: true },
      }),
    ).resolves.toMatchObject({ teamId: TEAM, isTeamDefault: true });
    await expect(callerFor(member.context).views.byTeam({ teamId: TEAM })).resolves.toEqual([
      expect.objectContaining({ id: adminView.id, isTeamDefault: true }),
    ]);
  });

  it("TEAM-BINDING authz: a plain member (non-admin) is refused manage_views; owner and role gates are cumulative", async () => {
    const { member, outsider } = await memberAndOutsider();
    const plain = await createTestContext(shared.db, curves);
    await shared.db
      .insert(teamMembers)
      .values({ teamId: TEAM, userId: plain.user.id, role: "member" });

    // the team ADMIN binds their own view into the team — the allowed path
    const adminView = await callerFor(member.context).views.create({
      name: "Admin's team view",
      teamId: TEAM,
      filter: teamFilter,
      display,
    });
    await expect(callerFor(member.context).views.byTeam({ teamId: TEAM })).resolves.toEqual([
      adminView,
    ]);

    // a plain member owns a personal view; binding it is refused (role gate)
    const ownView = await callerFor(plain.context).views.create({
      name: "Member's own",
      filter: teamFilter,
      display,
    });
    await expect(
      callerFor(plain.context).views.update({
        id: ownView.id,
        patch: { teamId: TEAM, isTeamDefault: true },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: /team admin role/i });
    // and even the team admin cannot touch the plain member's view —
    // ownership gates first (NOT_FOUND), role second
    await expect(
      callerFor(member.context).views.update({ id: ownView.id, patch: { name: "hijack" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // the outsider saw none of this
    await expect(callerFor(outsider.context).views.my()).resolves.toEqual([]);
  });
});

describe("notifications (strictly per-user)", () => {
  it("my/unreadCount/markRead/markAllRead only ever touch the caller's inbox", async () => {
    const { member, outsider } = await memberAndOutsider();
    const repo = createNotificationRepo(shared.db);
    // seeded directly: notification CREATION is a later-slice concern (issue
    // assignment); this router owns reads + read-marking
    for (const n of [1, 2, 3]) {
      await repo.create({
        userId: member.user.id,
        type: "assignment",
        entityType: "issue",
        entityId: issueId(`issue_seed_${n}`),
      });
    }
    await repo.create({
      userId: outsider.user.id,
      type: "mention",
      entityType: "issue",
      entityId: issueId("issue_seed_out"),
    });

    const memberCaller = callerFor(member.context);
    await expect(memberCaller.notifications.my({ limit: 10 })).resolves.toHaveLength(3);
    await expect(memberCaller.notifications.unreadCount()).resolves.toBe(3);

    const first = (await memberCaller.notifications.my({ limit: 1 }))[0];
    if (first === undefined) {
      throw new Error("expected the newest notification to exist");
    }
    await memberCaller.notifications.markRead({ id: first.id });
    await expect(memberCaller.notifications.unreadCount()).resolves.toBe(2);

    const all = await memberCaller.notifications.markAllRead();
    expect(all.count).toBe(2);
    await expect(memberCaller.notifications.unreadCount()).resolves.toBe(0);
    // the outsider's inbox was never touched
    await expect(callerFor(outsider.context).notifications.unreadCount()).resolves.toBe(1);
  });

  it("marking another user's notification read is NOT_FOUND and leaves it unread", async () => {
    const { member, outsider } = await memberAndOutsider();
    const repo = createNotificationRepo(shared.db);
    const seeded = await repo.create({
      userId: member.user.id,
      type: "mention",
      entityType: "issue",
      entityId: issueId("issue_seed_1"),
    });

    await expect(
      callerFor(outsider.context).notifications.markRead({ id: seeded.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await repo.byUser(member.user.id))[0]?.readAt).toBeNull();
  });

  it("limit 0 is BAD_REQUEST from zod", async () => {
    const { member } = await memberAndOutsider();
    await expect(callerFor(member.context).notifications.my({ limit: 0 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("users", () => {
  it("me returns the caller's safe projection only", async () => {
    const { member } = await memberAndOutsider();
    await expect(callerFor(member.context).users.me()).resolves.toEqual(member.user);
  });

  it("anonymous callers get UNAUTHORIZED", async () => {
    const anonymous = await createContext({ db: shared.db, auth: curves, headers: new Headers() });
    await expect(callerFor(anonymous).users.me()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
