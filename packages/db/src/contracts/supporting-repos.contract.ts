import {
  cycleId,
  type IssueId,
  issueId,
  projectId,
  stateId,
  teamId,
  userId,
} from "@curves/domain/core/ids";
import { orderKey } from "@curves/domain/issues/ordering";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import type { ActivityRepo } from "../repos/activity.repo";
import type { CommentRepo } from "../repos/comment.repo";
import type { CycleRepo } from "../repos/cycle.repo";
import type { WorkflowStateRepo } from "../repos/state.repo";
import type { TeamRepo } from "../repos/team.repo";
import { cycles } from "../schema/cycles";
import { issues } from "../schema/issues";
import { states } from "../schema/states";
import { teams } from "../schema/teams";
import { users } from "../schema/users";

/**
 * Importable behavioral suite for the supporting repos (CORE_MODEL §5) —
 * round-trips, ordering, boundary semantics, and the append-only activity
 * surface. Run against pglite by repos/supporting.integration.test.ts.
 */
export interface SupportingReposCtx {
  teamRepo: TeamRepo;
  stateRepo: WorkflowStateRepo;
  cycleRepo: CycleRepo;
  commentRepo: CommentRepo;
  activityRepo: ActivityRepo;
  /** Raw drizzle handle for fixture seeding only. */
  db: PgliteDatabase;
  close(): Promise<void>;
}

// ---------------------------------------------------------------- fixture

const ada = userId("user_ada");
const grace = userId("user_grace");
const eng = teamId("team_eng");
const ops = teamId("team_ops");
const nlb = teamId("team_nlb"); // no states at all — backlogState: null case

// ENG states seeded position-shuffled to prove byTeam ordering
const stBacklog = stateId("st_backlog"); // position 0, backlog
const stTodo = stateId("st_todo"); // position 1, unstarted
const stProg = stateId("st_prog"); // position 2, started
const stDone = stateId("st_done"); // position 3, completed
const stCanceled = stateId("st_canceled"); // position 4, canceled

// OPS has TWO backlog states — backlogState must pick the lowest position
const stOpsBacklogLow = stateId("st_ops_backlog_low"); // position 1, backlog
const stOpsBacklogHigh = stateId("st_ops_backlog_high"); // position 3, backlog

const T0 = Date.parse("2026-10-24T00:00:00.000Z");
const at = (ms: number): Date => new Date(T0 + ms);
const day = 24 * 60 * 60_000;
const minute = 60_000;

const engIssue = issueId("issue_support_1");
const otherIssue = issueId("issue_support_2");

const c1 = cycleId("cyc_1");
const c2 = cycleId("cyc_2");

const seed = async (db: PgliteDatabase): Promise<void> => {
  await db.insert(users).values([
    { id: ada, name: "Ada", email: "ada@example.com", avatarUrl: null, createdAt: at(0) },
    { id: grace, name: "Grace", email: "grace@example.com", avatarUrl: null, createdAt: at(0) },
  ]);
  // insertion order deliberately ≠ key order — list() must sort by key
  await db.insert(teams).values([
    { id: ops, key: "OPS", name: "Operations" },
    { id: nlb, key: "NLB", name: "No Backlog" },
    { id: eng, key: "ENG", name: "Engineering" },
  ]);
  await db.insert(states).values([
    // shuffled positions: 2, 0, 4, 1, 3
    { id: stProg, teamId: eng, name: "In Progress", category: "started", position: 2 },
    { id: stBacklog, teamId: eng, name: "Backlog", category: "backlog", position: 0 },
    { id: stCanceled, teamId: eng, name: "Canceled", category: "canceled", position: 4 },
    { id: stTodo, teamId: eng, name: "Todo", category: "unstarted", position: 1 },
    { id: stDone, teamId: eng, name: "Done", category: "completed", position: 3 },
    { id: stOpsBacklogHigh, teamId: ops, name: "Parking", category: "backlog", position: 3 },
    { id: stOpsBacklogLow, teamId: ops, name: "Triaged", category: "backlog", position: 1 },
  ]);
  // seeded cycles (created via repo are tested separately)
  await db.insert(cycles).values([
    { id: c1, teamId: eng, number: 1, startsAt: at(-14 * day), endsAt: at(-1 * day) },
    { id: c2, teamId: eng, number: 2, startsAt: at(-1 * day), endsAt: at(13 * day) },
  ]);
  const issueRow = (id: IssueId, number: number) => ({
    id,
    teamId: eng,
    number,
    title: `support ${number}`,
    description: "",
    stateId: stTodo,
    priority: 0 as const,
    estimate: null,
    assigneeId: null,
    creatorId: ada,
    parentId: null,
    order: orderKey(number),
    projectId: null,
    milestoneId: null,
    cycleId: null,
    createdAt: at(0),
    updatedAt: at(0),
    startedAt: null,
    completedAt: null,
    canceledAt: null,
    archivedAt: null,
  });
  await db.insert(issues).values([issueRow(engIssue, 1), issueRow(otherIssue, 2)]);
};

// ---------------------------------------------------------------- contract

export const supportingReposContract = (makeRepos: () => Promise<SupportingReposCtx>): void => {
  describe("supporting repos contract", () => {
    const setup = async (): Promise<SupportingReposCtx> => {
      const ctx = await makeRepos();
      await seed(ctx.db);
      return ctx;
    };

    describe("team repo", () => {
      it("round-trips byId and byKey; misses are null; list is ordered by key", async () => {
        const { teamRepo, close } = await setup();
        try {
          expect(await teamRepo.byId(eng)).toEqual({ id: eng, key: "ENG", name: "Engineering" });
          expect(await teamRepo.byKey("OPS")).toEqual({ id: ops, key: "OPS", name: "Operations" });
          expect(await teamRepo.byKey("NOPE")).toBeNull();
          expect(await teamRepo.byId(teamId("team_nope"))).toBeNull();
          // seeded out of key order (OPS, NLB, ENG) — list sorts
          expect((await teamRepo.list()).map((t) => t.key)).toEqual(["ENG", "NLB", "OPS"]);
        } finally {
          await close();
        }
      });
    });

    describe("workflow state repo", () => {
      it("byTeam returns only the team's states ordered by position; byId round-trips", async () => {
        const { stateRepo, close } = await setup();
        try {
          const engStates = await stateRepo.byTeam(eng);
          expect(engStates.map((s) => s.id)).toEqual([
            stBacklog,
            stTodo,
            stProg,
            stDone,
            stCanceled,
          ]);
          expect(await stateRepo.byTeam(ops)).toHaveLength(2); // isolation
          expect(await stateRepo.byId(stTodo)).toEqual({
            id: stTodo,
            teamId: eng,
            name: "Todo",
            category: "unstarted",
            position: 1,
          });
          expect(await stateRepo.byId(stateId("st_nope"))).toBeNull();
        } finally {
          await close();
        }
      });

      it("backlogState picks the lowest-position backlog; null when the team has none", async () => {
        const { stateRepo, close } = await setup();
        try {
          expect((await stateRepo.backlogState(eng))?.id).toBe(stBacklog);
          // two backlogs seeded at positions 3 and 1 — position 1 wins
          expect((await stateRepo.backlogState(ops))?.id).toBe(stOpsBacklogLow);
          expect(await stateRepo.backlogState(nlb)).toBeNull(); // no states at all
        } finally {
          await close();
        }
      });
    });

    describe("cycle repo", () => {
      it("byTeam is ordered by number; byId round-trips with timestamps as Dates", async () => {
        const { cycleRepo, close } = await setup();
        try {
          const list = await cycleRepo.byTeam(eng);
          expect(list.map((c) => c.number)).toEqual([1, 2]);
          const fetched = await cycleRepo.byId(c1);
          expect(fetched).not.toBeNull();
          expect(fetched?.startsAt).toEqual(at(-14 * day));
          expect(fetched?.startsAt).toBeInstanceOf(Date);
          expect(await cycleRepo.byId(cycleId("cyc_nope"))).toBeNull();
        } finally {
          await close();
        }
      });

      it("latestEndedBefore: endsAt-exclusive boundary (ended exactly at `at` counts), latest wins", async () => {
        const { cycleRepo, close } = await setup();
        try {
          const now = at(0); // c1 ended yesterday, c2 is current
          expect((await cycleRepo.latestEndedBefore(eng, now))?.id).toBe(c1);
          // classifyCycle semantics: at the exact endsAt instant the cycle is past
          expect((await cycleRepo.latestEndedBefore(eng, at(-1 * day)))?.id).toBe(c1);
          // nothing ended yet a day before that
          expect(await cycleRepo.latestEndedBefore(eng, at(-1 * day - 1))).toBeNull();
        } finally {
          await close();
        }
      });

      it("nextAfter: inclusive start boundary finds the contiguous cycle; none after → null", async () => {
        const { cycleRepo, close } = await setup();
        try {
          // c2 starts exactly when c1 ends — contiguous scheduling
          expect((await cycleRepo.nextAfter(eng, at(-1 * day)))?.id).toBe(c2);
          // before any later start — nothing begins after 20 days out
          expect(await cycleRepo.nextAfter(eng, at(20 * day))).toBeNull();
        } finally {
          await close();
        }
      });

      it("create round-trips, rejects zero-length spans, and maps duplicate (team, number) to DuplicateError", async () => {
        const { cycleRepo, close } = await setup();
        try {
          const created = await cycleRepo.create({
            teamId: eng,
            number: 3,
            startsAt: at(13 * day),
            endsAt: at(27 * day),
          });
          expect(created.number).toBe(3);
          expect(created.startsAt).toEqual(at(13 * day));
          expect((await cycleRepo.byId(created.id))?.endsAt).toEqual(at(27 * day));

          await expect(
            cycleRepo.create({
              teamId: eng,
              number: 3,
              startsAt: at(28 * day),
              endsAt: at(41 * day),
            }),
          ).rejects.toThrowError(/already exists/);

          // the unique index is per team — OPS may reuse number 3
          const other = await cycleRepo.create({
            teamId: ops,
            number: 3,
            startsAt: at(13 * day),
            endsAt: at(27 * day),
          });
          expect(other.teamId).toBe(ops);

          await expect(
            cycleRepo.create({
              teamId: eng,
              number: 4,
              startsAt: at(10 * day),
              endsAt: at(10 * day), // zero-length
            }),
          ).rejects.toThrowError(/startsAt must be before endsAt/);
        } finally {
          await close();
        }
      });
    });

    describe("comment repo", () => {
      it("create round-trips (createdAt === updatedAt) and byIssue is chronological with limit from the start", async () => {
        const { commentRepo, close } = await setup();
        try {
          const first = await commentRepo.create({
            issueId: engIssue,
            authorId: ada,
            body: "first",
            createdAt: at(minute),
          });
          expect(first.createdAt).toEqual(at(minute));
          expect(first.updatedAt).toEqual(first.createdAt);
          await commentRepo.create({
            issueId: engIssue,
            authorId: grace,
            body: "second",
            createdAt: at(2 * minute),
          });
          await commentRepo.create({
            issueId: engIssue,
            authorId: ada,
            body: "third",
            createdAt: at(3 * minute),
          });
          // isolation: another issue's comment is invisible
          await commentRepo.create({
            issueId: otherIssue,
            authorId: ada,
            body: "elsewhere",
            createdAt: at(4 * minute),
          });

          const all = await commentRepo.byIssue(engIssue);
          expect(all.map((c) => c.body)).toEqual(["first", "second", "third"]);
          expect(await commentRepo.byIssue(otherIssue)).toHaveLength(1);

          // limit applies in reading order (earliest first), like list pages
          expect((await commentRepo.byIssue(engIssue, 2)).map((c) => c.body)).toEqual([
            "first",
            "second",
          ]);
          await expect(commentRepo.byIssue(engIssue, 0)).rejects.toThrowError(/positive integer/);
        } finally {
          await close();
        }
      });
    });

    describe("activity repo", () => {
      it("record → byEntity is newest first with limit; payload JSON round-trips", async () => {
        const { activityRepo, close } = await setup();
        try {
          await activityRepo.record({
            actorId: ada,
            verb: "issue_created",
            entityType: "issue",
            entityId: engIssue,
            payload: { title: "support 1" },
            at: at(minute),
          });
          await activityRepo.record({
            actorId: grace,
            verb: "state_changed",
            entityType: "issue",
            entityId: engIssue,
            payload: { from: "Backlog", to: "Todo" },
            at: at(2 * minute),
          });
          await activityRepo.record({
            actorId: ada,
            verb: "commented",
            entityType: "issue",
            entityId: engIssue,
            payload: { body: "nested", meta: { mentions: 0 } },
            at: at(3 * minute),
          });

          const feed = await activityRepo.byEntity("issue", engIssue);
          expect(feed.map((a) => a.verb)).toEqual(["commented", "state_changed", "issue_created"]);
          expect(feed[2]?.payload).toEqual({ title: "support 1" });
          expect(feed[0]?.payload).toEqual({ body: "nested", meta: { mentions: 0 } });

          expect((await activityRepo.byEntity("issue", engIssue, 2)).map((a) => a.verb)).toEqual([
            "commented",
            "state_changed",
          ]);
          await expect(activityRepo.byEntity("issue", engIssue, -1)).rejects.toThrowError(
            /positive integer/,
          );
        } finally {
          await close();
        }
      });

      it("byEntity scopes by entity type — a same-string project id never leaks the issue trail", async () => {
        const { activityRepo, close } = await setup();
        try {
          const sameString = projectId("issue_support_1"); // same text as engIssue
          await activityRepo.record({
            actorId: ada,
            verb: "issue_created",
            entityType: "issue",
            entityId: engIssue,
            payload: { number: 1 },
            at: at(0),
          });
          await activityRepo.record({
            actorId: ada,
            verb: "moved_to_project",
            entityType: "project",
            entityId: sameString,
            payload: { from: null },
            at: at(minute),
          });
          expect((await activityRepo.byEntity("issue", engIssue)).map((a) => a.verb)).toEqual([
            "issue_created",
          ]);
          expect((await activityRepo.byEntity("project", sameString)).map((a) => a.verb)).toEqual([
            "moved_to_project",
          ]);
        } finally {
          await close();
        }
      });

      it("is append-only by design: no update/delete methods exist on the surface", async () => {
        const { activityRepo, close } = await setup();
        try {
          expect(Object.keys(activityRepo).sort()).toEqual(["byEntity", "record"]);
          // `activities` table is not even imported by any mutation path other
          // than record() — enforced by review and the repo's interface, not DDL
          expect(await activityRepo.byEntity("issue", engIssue)).toEqual([]);
        } finally {
          await close();
        }
      });
    });
  });
};
