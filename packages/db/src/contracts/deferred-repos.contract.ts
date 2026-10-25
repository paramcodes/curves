import { DuplicateError, NotFoundError } from "@curves/domain/core/errors";
import {
  issueId,
  labelId,
  milestoneId,
  notificationId,
  projectId,
  teamId,
  userId,
  viewId,
} from "@curves/domain/core/ids";
import type { DisplaySpec } from "@curves/domain/filters/display.types";
import type { FilterSpec } from "@curves/domain/filters/filter.types";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import type { LabelRepo } from "../repos/label.repo";
import type { MilestoneRepo } from "../repos/milestone.repo";
import type { NotificationRepo } from "../repos/notification.repo";
import type { ProjectRepo } from "../repos/project.repo";
import type { ViewRepo } from "../repos/view.repo";
import { teams } from "../schema/teams";
import { users } from "../schema/users";

/**
 * Importable behavioral suite for the five repos deferred from Phase 1 (S1) —
 * round-trips, ordering, the (team, name) label uniqueness, the
 * one-team-default-per-team view invariant, and notification inbox semantics.
 * Run against pglite by repos/deferred.integration.test.ts.
 */
export interface DeferredReposCtx {
  labelRepo: LabelRepo;
  projectRepo: ProjectRepo;
  milestoneRepo: MilestoneRepo;
  viewRepo: ViewRepo;
  notificationRepo: NotificationRepo;
  /** Raw drizzle handle for fixture seeding only. */
  db: PgliteDatabase;
  close(): Promise<void>;
}

// ---------------------------------------------------------------- fixture

const ada = userId("user_ada");
const grace = userId("user_grace");
const eng = teamId("team_eng");
const ops = teamId("team_ops");

const T0 = Date.parse("2026-10-25T00:00:00.000Z");
const at = (ms: number): Date => new Date(T0 + ms);
const minute = 60_000;

const display: DisplaySpec = {
  groupBy: "status",
  sortBy: "priority",
  direction: "desc",
  showSubIssues: false,
};
const filter: FilterSpec = { kind: "cond", key: "team", op: "eq", value: "team_eng" };

const seed = async (db: PgliteDatabase): Promise<void> => {
  await db.insert(users).values([
    { id: ada, name: "Ada", email: "ada@example.com", avatarUrl: null, createdAt: at(0) },
    { id: grace, name: "Grace", email: "grace@example.com", avatarUrl: null, createdAt: at(0) },
  ]);
  await db.insert(teams).values([
    { id: eng, key: "ENG", name: "Engineering" },
    { id: ops, key: "OPS", name: "Operations" },
  ]);
};

// ---------------------------------------------------------------- contract

export const deferredReposContract = (makeRepos: () => Promise<DeferredReposCtx>): void => {
  describe("deferred repos contract (phase-2 slice 1)", () => {
    const setup = async (): Promise<DeferredReposCtx> => {
      const ctx = await makeRepos();
      await seed(ctx.db);
      return ctx;
    };

    describe("label repo", () => {
      it("create round-trips; byTeam is ordered by name and scoped to the team", async () => {
        const { labelRepo, close } = await setup();
        try {
          // created out of name order — byTeam must sort
          const bug = await labelRepo.create({
            id: labelId("lbl_bug"),
            teamId: eng,
            name: "bug",
            color: "#f00",
          });
          await labelRepo.create({
            id: labelId("lbl_api"),
            teamId: eng,
            name: "api",
            color: "#0f0",
          });
          await labelRepo.create({
            id: labelId("lbl_ops_bug"),
            teamId: ops, // same name as eng's "bug" — per-team uniqueness allows it
            name: "bug",
            color: "#00f",
          });

          expect(bug).toEqual({ id: labelId("lbl_bug"), teamId: eng, name: "bug", color: "#f00" });
          expect((await labelRepo.byTeam(eng)).map((l) => l.id)).toEqual([
            labelId("lbl_api"),
            labelId("lbl_bug"),
          ]);
          expect(await labelRepo.byTeam(ops)).toHaveLength(1);
          expect(await labelRepo.byId(labelId("lbl_bug"))).toEqual(bug);
          expect(await labelRepo.byId(labelId("lbl_nope"))).toBeNull();
        } finally {
          await close();
        }
      });

      it("rejects a duplicate (team, name) on create and rename with DuplicateError", async () => {
        const { labelRepo, close } = await setup();
        try {
          await labelRepo.create({
            id: labelId("lbl_bug"),
            teamId: eng,
            name: "bug",
            color: "#f00",
          });
          await expect(
            labelRepo.create({ id: labelId("lbl_bug2"), teamId: eng, name: "bug", color: "#f00" }),
          ).rejects.toThrowError(DuplicateError);
          // the rejected create left exactly one "bug"
          expect(await labelRepo.byTeam(eng)).toHaveLength(1);

          await labelRepo.create({
            id: labelId("lbl_api"),
            teamId: eng,
            name: "api",
            color: "#0f0",
          });
          // renames collide with siblings too (renaming to your OWN name is a
          // no-op in Postgres — a row never conflicts with itself)
          await expect(labelRepo.rename(labelId("lbl_bug"), "api")).rejects.toThrowError(
            DuplicateError,
          );

          await labelRepo.rename(labelId("lbl_bug"), "defect");
          expect((await labelRepo.byId(labelId("lbl_bug")))?.name).toBe("defect");

          await labelRepo.delete(labelId("lbl_bug"));
          expect(await labelRepo.byId(labelId("lbl_bug"))).toBeNull();
        } finally {
          await close();
        }
      });
    });

    describe("project repo", () => {
      it("create defaults to planned/no health; list is ordered by name", async () => {
        const { projectRepo, close } = await setup();
        try {
          // created out of name order — list must sort
          const zeta = await projectRepo.create({
            id: projectId("proj_zeta"),
            name: "Zeta",
            description: "last alphabetically",
            leadId: ada,
            targetDate: at(30 * 24 * 60 * 60_000),
            createdAt: at(0),
          });
          const alpha = await projectRepo.create({
            id: projectId("proj_alpha"),
            name: "Alpha",
            description: "first alphabetically",
          });

          expect(zeta.status).toBe("planned");
          expect(zeta.health).toBeNull();
          expect(zeta.createdAt).toEqual(at(0));
          expect(zeta.targetDate).toEqual(at(30 * 24 * 60 * 60_000));
          expect(alpha.createdAt).toBeInstanceOf(Date); // clock defaulted

          expect((await projectRepo.list()).map((p) => p.id)).toEqual([
            projectId("proj_alpha"),
            projectId("proj_zeta"),
          ]);
          expect(await projectRepo.byId(projectId("proj_zeta"))).toEqual(zeta);
          expect(await projectRepo.byId(projectId("proj_nope"))).toBeNull();
        } finally {
          await close();
        }
      });

      it("update patches the given columns only; a missing project is NotFoundError", async () => {
        const { projectRepo, close } = await setup();
        try {
          const created = await projectRepo.create({
            id: projectId("proj_alpha"),
            name: "Alpha",
            description: "first",
            leadId: ada,
          });
          const updated = await projectRepo.update(projectId("proj_alpha"), {
            status: "in_progress",
            health: "at_risk",
            leadId: null,
            targetDate: at(7 * 24 * 60 * 60_000),
          });
          expect(updated).toEqual({
            ...created,
            status: "in_progress",
            health: "at_risk",
            leadId: null,
            targetDate: at(7 * 24 * 60 * 60_000),
          });
          expect(updated.name).toBe("Alpha"); // untouched column
          expect(await projectRepo.byId(projectId("proj_alpha"))).toEqual(updated);

          await expect(
            projectRepo.update(projectId("proj_nope"), { name: "Ghost" }),
          ).rejects.toThrowError(NotFoundError);
        } finally {
          await close();
        }
      });
    });

    describe("milestone repo", () => {
      it("byProject is ordered by position; byId round-trips nullable targetDate", async () => {
        const { milestoneRepo, projectRepo, close } = await setup();
        try {
          await projectRepo.create({
            id: projectId("proj_alpha"),
            name: "Alpha",
            description: "",
          });
          // positions deliberately shuffled — byProject must sort
          const m2 = await milestoneRepo.create({
            id: milestoneId("ms_2"),
            projectId: projectId("proj_alpha"),
            name: "Beta launch",
            position: 2,
          });
          const m0 = await milestoneRepo.create({
            id: milestoneId("ms_0"),
            projectId: projectId("proj_alpha"),
            name: "Kickoff",
            targetDate: at(7 * 24 * 60 * 60_000),
            position: 0,
          });
          await milestoneRepo.create({
            id: milestoneId("ms_1"),
            projectId: projectId("proj_alpha"),
            name: "Internal beta",
            position: 1,
          });

          expect((await milestoneRepo.byProject(projectId("proj_alpha"))).map((m) => m.id)).toEqual(
            [milestoneId("ms_0"), milestoneId("ms_1"), milestoneId("ms_2")],
          );
          expect(await milestoneRepo.byId(milestoneId("ms_0"))).toEqual(m0);
          expect(m0.targetDate).toEqual(at(7 * 24 * 60 * 60_000));
          expect(m2.targetDate).toBeNull();
          expect(await milestoneRepo.byId(milestoneId("ms_nope"))).toBeNull();
        } finally {
          await close();
        }
      });

      it("update patches; missing id is NotFoundError", async () => {
        const { milestoneRepo, projectRepo, close } = await setup();
        try {
          await projectRepo.create({
            id: projectId("proj_alpha"),
            name: "Alpha",
            description: "",
          });
          await milestoneRepo.create({
            id: milestoneId("ms_0"),
            projectId: projectId("proj_alpha"),
            name: "Kickoff",
            position: 0,
          });

          const updated = await milestoneRepo.update(milestoneId("ms_0"), {
            name: "Kickoff (moved)",
            position: 5,
          });
          expect(updated.name).toBe("Kickoff (moved)");
          expect(updated.position).toBe(5);
          expect(updated.targetDate).toBeNull();

          await expect(
            milestoneRepo.update(milestoneId("ms_nope"), { name: "Ghost" }),
          ).rejects.toThrowError(NotFoundError);
        } finally {
          await close();
        }
      });
    });

    describe("view repo", () => {
      const makeView = (id: string, name: string, overrides?: object) => ({
        id: viewId(id),
        ownerId: ada,
        teamId: eng as typeof eng | null,
        name,
        filter,
        display,
        ...overrides,
      });

      it("create round-trips filter/display JSON; byOwner and byTeam scope correctly", async () => {
        const { viewRepo, close } = await setup();
        try {
          const teamView = await viewRepo.create(makeView("view_team", "Team issues"));
          const personal = await viewRepo.create(
            makeView("view_personal", "Mine", { teamId: null }),
          );

          expect(teamView.filter).toEqual(filter);
          expect(teamView.display).toEqual(display);
          expect(teamView.isTeamDefault).toBe(false);
          expect(personal.teamId).toBeNull();

          expect((await viewRepo.byOwner(ada)).map((v) => v.id)).toEqual([
            viewId("view_personal"),
            viewId("view_team"),
          ]); // name order
          expect(await viewRepo.byOwner(grace)).toEqual([]); // isolation
          expect((await viewRepo.byTeam(eng)).map((v) => v.id)).toEqual([viewId("view_team")]);
          expect(await viewRepo.byId(viewId("view_team"))).toEqual(teamView);
          expect(await viewRepo.byId(viewId("view_nope"))).toBeNull();
        } finally {
          await close();
        }
      });

      it("ONE default per team: promoting B clears A; personal views are untouched", async () => {
        const { viewRepo, close } = await setup();
        try {
          await viewRepo.create(makeView("view_a", "All issues", { isTeamDefault: true }));
          await viewRepo.create(makeView("view_b", "My team view"));
          // a personal view carrying the flag must never be demoted by team logic
          await viewRepo.create(
            makeView("view_personal", "Mine", { teamId: null, isTeamDefault: true }),
          );
          // a default of ANOTHER team must survive too
          await viewRepo.create(
            makeView("view_ops", "Ops default", { teamId: ops, isTeamDefault: true }),
          );

          const promoted = await viewRepo.update(viewId("view_b"), { isTeamDefault: true });
          expect(promoted.isTeamDefault).toBe(true);

          const teamViews = await viewRepo.byTeam(eng);
          const flags = Object.fromEntries(teamViews.map((v) => [v.id, v.isTeamDefault]));
          expect(flags).toEqual({ [viewId("view_a")]: false, [viewId("view_b")]: true });

          expect((await viewRepo.byId(viewId("view_personal")))?.isTeamDefault).toBe(true);
          expect((await viewRepo.byId(viewId("view_ops")))?.isTeamDefault).toBe(true);

          // CREATE enforces the same invariant: a team default created over an
          // existing one demotes it (same transaction); personal/other-team
          // defaults still survive
          await viewRepo.create(makeView("view_c", "Created as default", { isTeamDefault: true }));
          const flagsAfterCreate = Object.fromEntries(
            (await viewRepo.byTeam(eng)).map((v) => [v.id, v.isTeamDefault]),
          );
          expect(flagsAfterCreate).toEqual({
            [viewId("view_a")]: false,
            [viewId("view_b")]: false,
            [viewId("view_c")]: true,
          });
          expect((await viewRepo.byId(viewId("view_personal")))?.isTeamDefault).toBe(true);
          expect((await viewRepo.byId(viewId("view_ops")))?.isTeamDefault).toBe(true);
        } finally {
          await close();
        }
      });

      it("update on a missing view is NotFoundError; delete removes the row", async () => {
        const { viewRepo, close } = await setup();
        try {
          await viewRepo.create(makeView("view_team", "Team issues"));

          await expect(
            viewRepo.update(viewId("view_nope"), { name: "Ghost" }),
          ).rejects.toThrowError(NotFoundError);

          await viewRepo.delete(viewId("view_team"));
          expect(await viewRepo.byId(viewId("view_team"))).toBeNull();
        } finally {
          await close();
        }
      });
    });

    describe("notification repo", () => {
      const notification = (id: string, owner: typeof ada, createdAt: Date) => ({
        id: notificationId(id),
        userId: owner,
        type: "mention" as const,
        entityType: "issue" as const,
        entityId: issueId("issue_1"),
        createdAt,
      });

      it("byUser is newest first with limit; unreadCount counts null readAt only", async () => {
        const { notificationRepo, close } = await setup();
        try {
          // inserted out of time order: 1min, 3min, 2min — newest-first must sort
          await notificationRepo.create(notification("n1", ada, at(minute)));
          await notificationRepo.create(notification("n3", ada, at(3 * minute)));
          await notificationRepo.create(notification("n2", ada, at(2 * minute)));
          await notificationRepo.create(notification("g1", grace, at(3 * minute)));

          const feed = await notificationRepo.byUser(ada);
          expect(feed.map((n) => n.id)).toEqual([
            notificationId("n3"),
            notificationId("n2"),
            notificationId("n1"),
          ]);
          expect((await notificationRepo.byUser(ada, { limit: 2 })).map((n) => n.id)).toEqual([
            notificationId("n3"),
            notificationId("n2"),
          ]);
          expect(await notificationRepo.byUser(grace)).toHaveLength(1); // isolation

          expect(await notificationRepo.unreadCount(ada)).toBe(3);
          await notificationRepo.markRead(notificationId("n2"), ada);
          expect(await notificationRepo.unreadCount(ada)).toBe(2);

          await expect(notificationRepo.byUser(ada, { limit: 0 })).rejects.toThrowError(
            /positive integer/,
          );
        } finally {
          await close();
        }
      });

      it("markRead is ownership-guarded; markAllRead stamps the given instant", async () => {
        const { notificationRepo, close } = await setup();
        try {
          await notificationRepo.create(notification("n1", ada, at(minute)));
          await notificationRepo.create(notification("g1", grace, at(minute)));

          // grace must not be able to read ada's notification — same error as a
          // missing id (no existence oracle), and ada's row stays unread
          await expect(notificationRepo.markRead(notificationId("n1"), grace)).rejects.toThrowError(
            NotFoundError,
          );
          expect(await notificationRepo.unreadCount(ada)).toBe(1);
          expect(await notificationRepo.unreadCount(grace)).toBe(1);

          await notificationRepo.markRead(notificationId("n1"), ada);
          const marked = (await notificationRepo.byUser(ada))[0];
          expect(marked?.readAt).toBeInstanceOf(Date);
          expect(await notificationRepo.unreadCount(ada)).toBe(0);

          // markAllRead touches only still-unread rows of that user, at `at`
          await notificationRepo.create(notification("n2", ada, at(2 * minute)));
          const markedCount = await notificationRepo.markAllRead(ada, at(4 * minute));
          expect(markedCount).toBe(1);
          expect((await notificationRepo.byUser(ada))[0]?.readAt).toEqual(at(4 * minute));
          // the already-read n1 keeps its earlier readAt
          expect((await notificationRepo.byUser(ada))[1]?.readAt).not.toEqual(at(4 * minute));
          expect(await notificationRepo.unreadCount(grace)).toBe(1); // grace untouched
        } finally {
          await close();
        }
      });
    });
  });
};
