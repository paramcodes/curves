import { fixedClock } from "@curves/domain/core/clock";
import { cycleId, issueId, stateId, teamId, userId } from "@curves/domain/core/ids";
import { orderKey } from "@curves/domain/issues/ordering";
import { eq } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import type { CycleRolloverJob } from "../jobs/rollover.job";
import { cycles } from "../schema/cycles";
import { issues } from "../schema/issues";
import { states } from "../schema/states";
import { teams } from "../schema/teams";
import { users } from "../schema/users";

/**
 * Importable behavioral suite for the cycle rollover job (CORE_MODEL §5):
 * policy application, rerun idempotency, interrupted-run convergence, and the
 * empty-team cases. Run against pglite by jobs/rollover.integration.test.ts.
 */
export interface RolloverJobCtx {
  job: CycleRolloverJob;
  /** Raw drizzle handle for fixture seeding and mid-flight simulation only. */
  db: PgliteDatabase;
  close(): Promise<void>;
}

// ---------------------------------------------------------------- fixture

const ada = userId("user_ada");
const eng = teamId("team_eng");
const ops = teamId("team_ops"); // ended cycle, NO follow-up — fallback case
const nom = teamId("team_nom"); // no cycles at all — nothing-finished case

const stBacklog = stateId("st_backlog"); // ENG position 0, backlog
const stTodo = stateId("st_todo"); // position 1, unstarted
const stProg = stateId("st_prog"); // position 2, started
const stDone = stateId("st_done"); // position 3, completed
const stCanceled = stateId("st_canceled"); // position 4, canceled
const stOpsBacklog = stateId("st_ops_backlog"); // OPS backlog
const stOpsProg = stateId("st_ops_prog"); // OPS started

const c1 = cycleId("cyc_past"); // ENG: ended yesterday
const c2 = cycleId("cyc_current"); // ENG: current, contiguous with c1
const o1 = cycleId("cyc_ops_past"); // OPS: ended 3 days ago, no follow-up

const u1 = issueId("issue_u1"); // unfinished: backlog state
const u2 = issueId("issue_u2"); // unfinished: todo
const u3 = issueId("issue_u3"); // unfinished: in progress
const f1 = issueId("issue_f1"); // finished: done
const f2 = issueId("issue_f2"); // finished: canceled
const a1 = issueId("issue_a1"); // unfinished state BUT archived — must not move
const ou1 = issueId("issue_ou1"); // OPS unfinished in o1
const ou2 = issueId("issue_ou2"); // OPS unfinished in o1

const T0 = Date.parse("2026-10-24T00:00:00.000Z");
const at = (ms: number): Date => new Date(T0 + ms);
const day = 24 * 60 * 60_000;
const minute = 60_000;
const now = fixedClock(at(0));

const seed = async (db: PgliteDatabase): Promise<void> => {
  await db
    .insert(users)
    .values([
      { id: ada, name: "Ada", email: "ada@example.com", avatarUrl: null, createdAt: at(0) },
    ]);
  await db.insert(teams).values([
    { id: eng, key: "ENG", name: "Engineering" },
    { id: ops, key: "OPS", name: "Operations" },
    { id: nom, key: "NOM", name: "No Cycles" },
  ]);
  await db.insert(states).values([
    { id: stBacklog, teamId: eng, name: "Backlog", category: "backlog", position: 0 },
    { id: stTodo, teamId: eng, name: "Todo", category: "unstarted", position: 1 },
    { id: stProg, teamId: eng, name: "In Progress", category: "started", position: 2 },
    { id: stDone, teamId: eng, name: "Done", category: "completed", position: 3 },
    { id: stCanceled, teamId: eng, name: "Canceled", category: "canceled", position: 4 },
    { id: stOpsBacklog, teamId: ops, name: "Backlog", category: "backlog", position: 0 },
    { id: stOpsProg, teamId: ops, name: "Active", category: "started", position: 1 },
  ]);
  await db.insert(cycles).values([
    { id: c1, teamId: eng, number: 1, startsAt: at(-14 * day), endsAt: at(-1 * day) },
    { id: c2, teamId: eng, number: 2, startsAt: at(-1 * day), endsAt: at(13 * day) },
    { id: o1, teamId: ops, number: 1, startsAt: at(-10 * day), endsAt: at(-3 * day) },
  ]);
  // every issue gets updatedAt ≠ createdAt so a job re-stamp at T0 is observable
  const row = (
    id: typeof u1,
    number: number,
    stateIdOf: typeof stTodo,
    over: Partial<typeof issues.$inferInsert> = {},
  ) => ({
    id,
    teamId: eng,
    number,
    title: `issue ${number}`,
    description: "",
    stateId: stateIdOf,
    priority: 0 as const,
    estimate: null,
    assigneeId: null,
    creatorId: ada,
    parentId: null,
    order: orderKey(number),
    projectId: null,
    milestoneId: null,
    cycleId: c1,
    createdAt: at(-2 * day),
    updatedAt: at(-2 * day + 5 * minute),
    startedAt: null,
    completedAt: null,
    canceledAt: null,
    archivedAt: null,
    ...over,
  });
  await db
    .insert(issues)
    .values([
      row(u1, 1, stBacklog),
      row(u2, 2, stTodo),
      row(u3, 3, stProg),
      row(f1, 4, stDone),
      row(f2, 5, stCanceled),
      row(a1, 6, stProg, { archivedAt: at(-30 * minute) }),
      row(ou1, 1, stOpsProg, { teamId: ops, cycleId: o1 }),
      row(ou2, 2, stOpsProg, { teamId: ops, cycleId: o1 }),
    ]);
};

// ---------------------------------------------------------------- helpers

type IssueSnapshot = {
  id: string;
  cycleId: string | null;
  stateId: string;
  archivedAt: Date | null;
  updatedAt: Date;
};

const snapshot = async (db: PgliteDatabase, ids: string[]): Promise<IssueSnapshot[]> => {
  const rows = await db
    .select({
      id: issues.id,
      cycleId: issues.cycleId,
      stateId: issues.stateId,
      archivedAt: issues.archivedAt,
      updatedAt: issues.updatedAt,
    })
    .from(issues);
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  return ids.map((id) => {
    const row = byId.get(id);
    if (row === undefined) {
      throw new Error(`fixture bug: ${id} missing`);
    }
    return {
      id: row.id as string,
      cycleId: row.cycleId ?? null,
      stateId: row.stateId as string,
      archivedAt: row.archivedAt,
      updatedAt: row.updatedAt,
    };
  });
};

// ---------------------------------------------------------------- contract

export const rolloverJobContract = (makeJob: () => Promise<RolloverJobCtx>): void => {
  describe("cycle rollover job contract", () => {
    const setup = async (): Promise<RolloverJobCtx> => {
      const ctx = await makeJob();
      await seed(ctx.db);
      return ctx;
    };

    it("next_cycle moves the 3 unfinished issues to the next cycle, states unchanged; done/canceled/archived stay", async () => {
      const { job, db, close } = await setup();
      try {
        const result = await job.runCycleRollover(eng, "next_cycle", now);
        expect(result).toEqual({ moved: 3, rerunNoop: false });

        const snap = await snapshot(db, [u1, u2, u3, f1, f2, a1].map(String));
        const byId = new Map(snap.map((s) => [s.id, s]));
        // unfinished work moved to c2, state carries over (toStateId null)
        for (const id of [u1, u2, u3]) {
          const issue = byId.get(String(id));
          expect(issue?.cycleId).toBe(c2);
          expect(issue?.updatedAt).toEqual(at(0)); // stamped by the job's clock
        }
        expect(byId.get(String(u1))?.stateId).toBe(stBacklog);
        expect(byId.get(String(u2))?.stateId).toBe(stTodo);
        expect(byId.get(String(u3))?.stateId).toBe(stProg);
        // finished and archived work is left alone
        for (const id of [f1, f2, a1]) {
          const issue = byId.get(String(id));
          expect(issue?.cycleId).toBe(c1);
          expect(issue?.updatedAt).toEqual(at(-2 * day + 5 * minute));
        }
        expect(byId.get(String(a1))?.archivedAt).toEqual(at(-30 * minute));
      } finally {
        await close();
      }
    });

    it("rerunning after success is a no-op that leaves the data identical", async () => {
      const { job, db, close } = await setup();
      try {
        const first = await job.runCycleRollover(eng, "next_cycle", now);
        expect(first.moved).toBe(3);
        const before = await snapshot(db, [u1, u2, u3, f1, f2, a1].map(String));

        const second = await job.runCycleRollover(eng, "next_cycle", now);
        expect(second).toEqual({ moved: 0, rerunNoop: true });

        expect(await snapshot(db, [u1, u2, u3, f1, f2, a1].map(String))).toEqual(before);
      } finally {
        await close();
      }
    });

    it("backlog policy moves unfinished work to the backlog state and clears the cycle", async () => {
      const { job, db, close } = await setup();
      try {
        const result = await job.runCycleRollover(eng, "backlog", now);
        expect(result).toEqual({ moved: 3, rerunNoop: false });

        const snap = await snapshot(db, [u1, u2, u3, f1, f2].map(String));
        const byId = new Map(snap.map((s) => [s.id, s]));
        for (const id of [u1, u2, u3]) {
          const issue = byId.get(String(id));
          expect(issue?.cycleId).toBeNull();
          expect(issue?.stateId).toBe(stBacklog);
        }
        expect(byId.get(String(f1))?.cycleId).toBe(c1);
        expect(byId.get(String(f1))?.stateId).toBe(stDone);
      } finally {
        await close();
      }
    });

    it("an interrupted run converges: the already-applied move is not reapplied, only the remainder runs", async () => {
      const { job, db, close } = await setup();
      try {
        // simulate a crashed half-run: u1's move already landed (stamped mid-crash)
        await db
          .update(issues)
          .set({ cycleId: c2, updatedAt: at(-5 * minute) })
          .where(eq(issues.id, u1));

        const result = await job.runCycleRollover(eng, "next_cycle", now);
        expect(result).toEqual({ moved: 2, rerunNoop: false });

        const snap = await snapshot(db, [u1, u2, u3].map(String));
        const byId = new Map(snap.map((s) => [s.id, s]));
        // all three ended up in c2; u1 untouched by this run (stamp preserved)
        for (const id of [u1, u2, u3]) {
          expect(byId.get(String(id))?.cycleId).toBe(c2);
        }
        expect(byId.get(String(u1))?.updatedAt).toEqual(at(-5 * minute));
        expect(byId.get(String(u2))?.updatedAt).toEqual(at(0));

        // NOTE: what single-connection pglite can observe is layer-1 idempotency
        // (the plan recomputes from current state, so u1 is not re-planned).
        // The job's in-transaction already-at-target skip is the second layer,
        // reachable only when a concurrent twin commits between read and apply
        // — it exists for real Postgres; see rollover.job.ts.
      } finally {
        await close();
      }
    });

    it("next_cycle with no follow-up cycle falls back to the backlog move", async () => {
      const { job, db, close } = await setup();
      try {
        const result = await job.runCycleRollover(ops, "next_cycle", now);
        expect(result).toEqual({ moved: 2, rerunNoop: false });

        const snap = await snapshot(db, [ou1, ou2].map(String));
        for (const issue of snap) {
          expect(issue.cycleId).toBeNull();
          expect(issue.stateId).toBe(stOpsBacklog);
        }
      } finally {
        await close();
      }
    });

    it("a team with no ended cycle is an immediate no-op", async () => {
      const { job, close } = await setup();
      try {
        expect(await job.runCycleRollover(nom, "next_cycle", now)).toEqual({
          moved: 0,
          rerunNoop: true,
        });
        expect(await job.runCycleRollover(nom, "backlog", now)).toEqual({
          moved: 0,
          rerunNoop: true,
        });
      } finally {
        await close();
      }
    });
  });
};
