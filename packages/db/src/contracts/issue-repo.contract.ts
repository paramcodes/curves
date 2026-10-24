import { ValidationError } from "@curves/domain/core/errors";
import {
  cycleId,
  issueId,
  labelId,
  projectId,
  stateId,
  teamId,
  userId,
} from "@curves/domain/core/ids";
import type { DisplaySpec } from "@curves/domain/filters/display.types";
import { evaluate } from "@curves/domain/filters/evaluate";
import type {
  CondOp,
  FilterKey,
  FilterSpec,
  FilterValue,
} from "@curves/domain/filters/filter.types";
import type { Issue, OrderKey } from "@curves/domain/issues/issue.types";
import { orderKey, orderKeyNumber } from "@curves/domain/issues/ordering";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import type { IssueRepo } from "../repos/issue.repo";
import { parseCursor, serializeCursor } from "../repos/list";
import { cycles } from "../schema/cycles";
import { issueLabels } from "../schema/issue_labels";
import { issueRelations } from "../schema/issue_relations";
import { issues } from "../schema/issues";
import { labels } from "../schema/labels";
import { projects } from "../schema/projects";
import { states } from "../schema/states";
import { teams } from "../schema/teams";
import { users } from "../schema/users";

/**
 * Importable behavioral suite for any IssueRepo (CORE_MODEL §5) — run against
 * pglite by repos/issue-repo.integration.test.ts, later against real Postgres
 * too. The LIST-VS-EVALUATE oracle runs every filter spec through both the
 * repo's SQL and the domain's pure `evaluate` over the same fixture and
 * asserts identical membership.
 */
export interface IssueRepoContractCtx {
  repo: IssueRepo;
  /**
   * Raw drizzle handle for fixture seeding only — the repo owns the issue
   * aggregate, but issues FK-reference users/teams/states/labels/projects/
   * cycles that no repo method creates.
   */
  db: PgliteDatabase;
  close(): Promise<void>;
}

// ---------------------------------------------------------------- fixture

const ada = userId("user_ada");
const grace = userId("user_grace");
const teamA = teamId("team_a");
const teamB = teamId("team_b");
const stReady = stateId("st_ready");
const stDoing = stateId("st_doing");
const stDone = stateId("st_done");
const stOps = stateId("st_ops");
const lbBug = labelId("lb_bug");
const lbPerf = labelId("lb_perf");
const prjX = projectId("prj_x");
const cyc1 = cycleId("cyc_1");

const T0 = Date.parse("2026-10-24T00:00:00.000Z");
const at = (ms: number): Date => new Date(T0 + ms);
const minute = 60_000;

/** Deterministic issue; even numbers keep updatedAt == createdAt, odd add 10m. */
const fixtureIssue = (over: Partial<Issue> & Pick<Issue, "id" | "number">): Issue => {
  const created = over.createdAt ?? at(over.number * minute);
  const updated =
    over.updatedAt ?? (over.number % 2 === 0 ? created : at(over.number * minute + 10 * minute));
  return {
    teamId: teamA,
    title: `issue ${over.number}`,
    description: "",
    stateId: stReady,
    priority: 0,
    estimate: null,
    assigneeId: null,
    creatorId: ada,
    parentId: null,
    labelIds: [],
    order: orderKey(over.number),
    projectId: null,
    milestoneId: null,
    cycleId: null,
    createdAt: created,
    updatedAt: updated,
    startedAt: null,
    completedAt: null,
    canceledAt: null,
    archivedAt: null,
    ...over,
  };
};

const ISSUES: Issue[] = [
  fixtureIssue({
    id: issueId("issue_1"),
    number: 1,
    title: "alpha bug",
    stateId: stReady,
    priority: 1,
    estimate: null,
    assigneeId: null,
    labelIds: [lbBug],
  }),
  fixtureIssue({
    id: issueId("issue_2"),
    number: 2,
    title: "beta perf",
    stateId: stDoing,
    priority: 4,
    estimate: 5,
    assigneeId: ada,
    labelIds: [lbBug, lbPerf],
    projectId: prjX,
    cycleId: cyc1,
    startedAt: at(2 * minute),
  }),
  fixtureIssue({
    id: issueId("issue_3"),
    number: 3,
    title: "gamma",
    stateId: stDoing,
    priority: 3,
    estimate: 2,
    assigneeId: grace,
  }),
  fixtureIssue({
    id: issueId("issue_4"),
    number: 4,
    title: "delta",
    stateId: stDone,
    priority: 0,
    estimate: 3,
    assigneeId: ada,
    labelIds: [lbPerf],
    completedAt: at(5 * minute),
  }),
  fixtureIssue({
    id: issueId("issue_5"),
    number: 5,
    title: "epsilon",
    stateId: stReady,
    priority: 2,
    assigneeId: grace,
    projectId: prjX,
  }),
  fixtureIssue({
    id: issueId("issue_6"),
    number: 6,
    title: "zeta",
    stateId: stDone,
    priority: 4,
    estimate: 8,
    assigneeId: ada,
    labelIds: [lbBug],
    cycleId: cyc1,
  }),
  fixtureIssue({
    id: issueId("issue_7"),
    number: 7,
    title: "same title",
    stateId: stReady,
    priority: 1,
    estimate: 1,
  }),
  // i7/i8 share a createdAt AND a title — exercises the id tiebreak on both sorts
  fixtureIssue({
    id: issueId("issue_8"),
    number: 8,
    title: "same title",
    stateId: stDoing,
    priority: 3,
    estimate: 2,
    assigneeId: grace,
    labelIds: [lbPerf],
    createdAt: at(7 * minute),
  }),
  fixtureIssue({
    id: issueId("issue_9"),
    number: 9,
    title: "eta",
    stateId: stReady,
    priority: 0,
    assigneeId: ada,
    projectId: prjX,
  }),
  fixtureIssue({
    id: issueId("issue_10"),
    number: 10,
    title: "theta long title",
    stateId: stDone,
    priority: 2,
    estimate: 5,
    assigneeId: grace,
    labelIds: [lbBug],
  }),
  // second team — team-scoped filters and per-team numbers
  fixtureIssue({
    id: issueId("issue_11"),
    number: 1,
    title: "ops one",
    teamId: teamB,
    stateId: stOps,
    priority: 3,
    assigneeId: ada,
    order: orderKey(100),
  }),
  fixtureIssue({
    id: issueId("issue_12"),
    number: 2,
    title: "ops two",
    teamId: teamB,
    stateId: stOps,
    priority: 1,
    estimate: 2,
    assigneeId: grace,
    labelIds: [lbBug],
    order: orderKey(101),
  }),
];

const seed = async (db: PgliteDatabase): Promise<void> => {
  await db.insert(users).values([
    { id: ada, name: "Ada", email: "ada@example.com", avatarUrl: null, createdAt: at(0) },
    { id: grace, name: "Grace", email: "grace@example.com", avatarUrl: null, createdAt: at(0) },
  ]);
  await db.insert(teams).values([
    { id: teamA, key: "ENG", name: "Engineering" },
    { id: teamB, key: "OPS", name: "Operations" },
  ]);
  await db.insert(states).values([
    { id: stReady, teamId: teamA, name: "Backlog", category: "backlog", position: 0 },
    { id: stDoing, teamId: teamA, name: "In Progress", category: "started", position: 1 },
    { id: stDone, teamId: teamA, name: "Done", category: "completed", position: 2 },
    { id: stOps, teamId: teamB, name: "Backlog", category: "backlog", position: 0 },
  ]);
  await db.insert(labels).values([
    { id: lbBug, teamId: teamA, name: "Bug", color: "#f00" },
    { id: lbPerf, teamId: teamA, name: "Perf", color: "#0f0" },
  ]);
  await db.insert(projects).values({
    id: prjX,
    name: "Project X",
    description: "",
    status: "in_progress",
    health: "on_track",
    leadId: ada,
    targetDate: null,
    createdAt: at(0),
  });
  await db.insert(cycles).values({
    id: cyc1,
    teamId: teamA,
    number: 1,
    startsAt: at(0),
    endsAt: at(14 * 24 * 60 * minute),
  });
  await db.insert(issues).values(ISSUES.map(({ labelIds: _labelIds, ...row }) => row));
  await db
    .insert(issueLabels)
    .values(
      ISSUES.flatMap((issue) => issue.labelIds.map((labelId) => ({ issueId: issue.id, labelId }))),
    );
};

// ---------------------------------------------------------------- helpers

const cond = (key: FilterKey, op: CondOp, value: FilterValue): FilterSpec => ({
  kind: "cond",
  key,
  op,
  value,
});

const AND = (...children: FilterSpec[]): FilterSpec => ({ kind: "group", op: "and", children });
const OR = (...children: FilterSpec[]): FilterSpec => ({ kind: "group", op: "or", children });

const display = (over: Partial<DisplaySpec> = {}): DisplaySpec => ({
  groupBy: "none",
  sortBy: "created",
  direction: "asc",
  showSubIssues: false,
  ...over,
});

const sortValue = (issue: Issue, sortBy: DisplaySpec["sortBy"]): string | number => {
  switch (sortBy) {
    case "priority":
      return issue.priority;
    case "updated":
      return issue.updatedAt.getTime();
    case "created":
      return issue.createdAt.getTime();
    case "title":
      return issue.title;
    case "order":
      return orderKeyNumber(issue.order);
  }
};

/** JS mirror of the repo's SQL ordering: (sortValue, id) with the direction applied to both. */
const compareBy = (
  sortBy: DisplaySpec["sortBy"],
  direction: DisplaySpec["direction"],
): ((a: Issue, b: Issue) => number) => {
  const dir = direction === "asc" ? 1 : -1;
  return (a, b) => {
    const va = sortValue(a, sortBy);
    const vb = sortValue(b, sortBy);
    const cmp = va < vb ? -1 : va > vb ? 1 : 0;
    if (cmp !== 0) {
      return cmp * dir;
    }
    return (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) * dir;
  };
};

const sortedIds = (list: Issue[]): string[] => list.map((i) => i.id).sort();

const walk = async (
  repo: IssueRepo,
  filter: FilterSpec,
  displaySpec: DisplaySpec,
  limit: number,
  startCursor: string | null = null,
): Promise<Issue[]> => {
  const items: Issue[] = [];
  let cursor = startCursor;
  for (let page = 0; page < 1000; page++) {
    const result = await repo.list({ filter, display: displaySpec, cursor, limit });
    items.push(...result.items);
    if (result.nextCursor === null) {
      return items;
    }
    cursor = result.nextCursor;
  }
  throw new Error("walk did not terminate after 1000 pages");
};

const sumCounts = (counts: { key: string; count: number }[]): number =>
  counts.reduce((acc, c) => acc + c.count, 0);

// Every FilterKey × representative ops. The oracle runs each through BOTH the
// repo (SQL) and the domain evaluate() (in-memory) and requires the same set.
const ORACLE_SPECS: Array<{ name: string; spec: FilterSpec }> = [
  { name: "state in", spec: cond("state", "in", [stDoing, stDone]) },
  { name: "priority gte", spec: cond("priority", "gte", 3) },
  { name: "priority lte", spec: cond("priority", "lte", 1) },
  { name: "assignee eq null", spec: cond("assignee", "eq", null) },
  { name: "assignee eq", spec: cond("assignee", "eq", "user_ada") },
  { name: "assignee exists", spec: cond("assignee", "exists", null) },
  { name: "assignee nin (null fields match)", spec: cond("assignee", "nin", [ada]) },
  // null array members are outside the declared FilterValue but the zod
  // schema is permissive by design — evaluate has defined semantics, so the
  // SQL mirror must hold them too
  {
    name: "assignee in with null member",
    spec: cond("assignee", "in", [ada, null] as unknown as FilterValue),
  },
  { name: "creator eq", spec: cond("creator", "eq", ada) },
  { name: "label in", spec: cond("label", "in", [lbBug]) },
  { name: "label nin", spec: cond("label", "nin", [lbPerf]) },
  { name: "label exists", spec: cond("label", "exists", null) },
  { name: "project eq", spec: cond("project", "eq", prjX) },
  { name: "cycle eq", spec: cond("cycle", "eq", cyc1) },
  { name: "team eq (other team)", spec: cond("team", "eq", teamB) },
  { name: "estimate gte (nulls excluded)", spec: cond("estimate", "gte", 2) },
  { name: "created lte", spec: cond("created", "lte", at(5 * minute).getTime()) },
  { name: "updated gt", spec: cond("updated", "gt", at(7 * minute).getTime()) },
  {
    name: "nested and/or",
    spec: AND(
      cond("priority", "lte", 2),
      OR(cond("assignee", "eq", ada), cond("label", "in", [lbBug])),
    ),
  },
  { name: "empty or-group is false", spec: OR() },
  { name: "empty and-group is true", spec: AND() },
  // Phase-1 review B1 repros: wire-valid (zod-blessed) cross-typed values where
  // Postgres would silently coerce ("3" → 3, ISO string → timestamptz) but
  // evaluate is strict — the SQL mirror must agree with evaluate, not PG.
  {
    name: "created eq ISO string (cross-typed, matches nothing)",
    spec: cond("created", "eq", at(3 * minute).toISOString()),
  },
  {
    name: "priority in ['3'] (cross-typed members never match)",
    spec: cond("priority", "in", ["3"]),
  },
  {
    name: "priority neq '3' (cross-typed, true for every row)",
    spec: cond("priority", "neq", "3"),
  },
  {
    name: "priority neq 3 (scalar — IS DISTINCT FROM incl. null estimate-like fields)",
    spec: cond("priority", "neq", 3),
  },
  {
    name: "assignee nin with null member (null fields stay non-members)",
    spec: cond("assignee", "nin", [ada, null] as unknown as FilterValue),
  },
];

// ---------------------------------------------------------------- contract

export const issueRepoContract = (makeRepo: () => Promise<IssueRepoContractCtx>): void => {
  describe("IssueRepo contract", () => {
    // every test gets a fresh database with the full fixture seeded
    const setup = async (): Promise<IssueRepoContractCtx> => {
      const ctx = await makeRepo();
      await seed(ctx.db);
      return ctx;
    };

    it("create → byId round-trips branded ids, nullables, labels, and timestamps", async () => {
      const { repo, close } = await setup();
      try {
        const created = await repo.create(
          {
            teamId: teamA,
            title: "round trip",
            description: "markdown body",
            stateId: stDoing,
            priority: 3,
            estimate: 5,
            assigneeId: grace,
            creatorId: ada,
            projectId: prjX,
            cycleId: cyc1,
            labelIds: [lbBug, lbPerf],
            createdAt: at(0),
          },
          orderKey(1.5),
        );
        expect(created.number).toBe(11); // teamA's seeded issues hold 1-10 (max+1)
        expect(created.order).toBe("1.5");
        expect(created.labelIds).toEqual([lbBug, lbPerf]);
        expect(created.startedAt).toBeNull();
        expect(created.completedAt).toBeNull();
        expect(created.archivedAt).toBeNull();
        expect(created.createdAt).toEqual(at(0));
        expect(created.updatedAt).toEqual(at(0));

        const fetched = await repo.byId(created.id);
        expect(fetched).toEqual(created);
        expect(await repo.byId(issueId("issue_nope"))).toBeNull();
      } finally {
        await close();
      }
    });

    it("maps seeded rows through toDomain exactly (full deep round-trip)", async () => {
      const { repo, close } = await setup();
      try {
        const i2 = ISSUES[1];
        if (i2 === undefined) {
          throw new Error("fixture bug: issue_2 missing");
        }
        const fetched = await repo.byId(i2.id);
        expect(fetched).toEqual(i2);
      } finally {
        await close();
      }
    });

    it("LIST-VS-EVALUATE oracle: repo list === domain evaluate over the same rows", async () => {
      const { repo, close } = await setup();
      try {
        for (const { name, spec } of ORACLE_SPECS) {
          const result = await repo.list({
            filter: spec,
            display: display({ sortBy: "created" }),
            cursor: null,
            limit: 100,
          });
          const expected = ISSUES.filter((issue) => evaluate(spec, issue));
          expect(sortedIds(result.items), `oracle spec: ${name}`).toEqual(sortedIds(expected));
        }
      } finally {
        await close();
      }
    });

    it("groupCounts: sums match the filtered total (label sums incidences); unskewed by cursor/limit", async () => {
      const { repo, close } = await setup();
      try {
        // st_ready: i1 (no assignee), i5 (grace), i7 (no assignee), i9 (ada)
        const filter = cond("state", "eq", stReady);
        const full = await repo.list({
          filter,
          display: display({ groupBy: "assignee" }),
          cursor: null,
          limit: 100,
        });
        expect(full.groupCounts).toEqual([
          { key: "__none__", count: 2 },
          { key: "user_ada", count: 1 },
          { key: "user_grace", count: 1 },
        ]);
        expect(sumCounts(full.groupCounts)).toBe(full.items.length);

        for (const groupBy of ["status", "priority", "none"] as const) {
          const result = await repo.list({
            filter,
            display: display({ groupBy }),
            cursor: null,
            limit: 100,
          });
          expect(sumCounts(result.groupCounts), `groupBy=${groupBy}`).toBe(full.items.length);
        }
        const none = await repo.list({
          filter,
          display: display({ groupBy: "none" }),
          cursor: null,
          limit: 100,
        });
        expect(none.groupCounts).toEqual([{ key: "all", count: 4 }]);

        // label grouping counts incidences: only i1 carries a label here
        const byLabel = await repo.list({
          filter,
          display: display({ groupBy: "label" }),
          cursor: null,
          limit: 100,
        });
        expect(byLabel.groupCounts).toEqual([{ key: lbBug, count: 1 }]);
        expect(sumCounts(byLabel.groupCounts)).toBe(1);

        // group counts are computed over the whole filtered set — the first
        // page of a paged query reports the same counts
        const paged = await repo.list({
          filter,
          display: display({ groupBy: "assignee" }),
          cursor: null,
          limit: 2,
        });
        expect(paged.groupCounts).toEqual(full.groupCounts);
        expect(paged.items.length).toBe(2);
      } finally {
        await close();
      }
    });

    it("pagination walk (limit 2) over every sort/direction collects exactly the sorted set", async () => {
      const { repo, close } = await setup();
      try {
        for (const sortBy of ["priority", "updated", "created", "title", "order"] as const) {
          for (const direction of ["asc", "desc"] as const) {
            const walked = await walk(repo, AND(), display({ sortBy, direction }), 2);
            const expected = [...ISSUES].sort(compareBy(sortBy, direction));
            expect(
              walked.map((i) => i.id),
              `sortBy=${sortBy} direction=${direction}`,
            ).toEqual(expected.map((i) => i.id));
          }
        }
      } finally {
        await close();
      }
    });

    it("walks a filtered set the same way (cursor composes with the filter)", async () => {
      const { repo, close } = await setup();
      try {
        const filter = cond("team", "eq", teamA);
        const walked = await walk(repo, filter, display({ sortBy: "order", direction: "asc" }), 2);
        const expected = ISSUES.filter((i) => evaluate(filter, i)).sort(compareBy("order", "asc"));
        expect(walked.map((i) => i.id)).toEqual(expected.map((i) => i.id));
      } finally {
        await close();
      }
    });

    it("CURSOR STABILITY: a row sorting before the cursor mid-walk does not disturb the remainder", async () => {
      const { repo, db, close } = await setup();
      try {
        const spec = display({ sortBy: "created", direction: "asc" });
        const expected = [...ISSUES].sort(compareBy("created", "asc"));
        const filter = AND();

        // two pages, then a concurrent writer lands a row sorting before everything
        const page1 = await repo.list({ filter, display: spec, cursor: null, limit: 2 });
        const page2 = await repo.list({
          filter,
          display: spec,
          cursor: page1.nextCursor,
          limit: 2,
        });
        expect(page1.items.map((i) => i.id)).toEqual(expected.slice(0, 2).map((i) => i.id));
        expect(page2.items.map((i) => i.id)).toEqual(expected.slice(2, 4).map((i) => i.id));

        await db.insert(issues).values({
          id: issueId("issue_new"),
          teamId: teamA,
          number: 99,
          title: "late arrival",
          description: "",
          stateId: stReady,
          priority: 0,
          estimate: null,
          assigneeId: null,
          creatorId: ada,
          parentId: null,
          order: orderKey(-1),
          projectId: null,
          milestoneId: null,
          cycleId: null,
          createdAt: at(-minute),
          updatedAt: at(-minute),
          startedAt: null,
          completedAt: null,
          canceledAt: null,
          archivedAt: null,
        });

        // continuing from the pre-insert cursor returns exactly the original
        // remainder — the new row is invisible past that point
        const remainder = await walk(repo, filter, spec, 2, page2.nextCursor);
        expect(remainder.map((i) => i.id)).toEqual(expected.slice(4).map((i) => i.id));
        expect(remainder.some((i) => i.id === "issue_new")).toBe(false);

        // and a fresh full walk DOES pick the new row up, sorted first —
        // proving the exclusion above is the keyset cursor doing its job
        const fresh = await walk(repo, filter, spec, 2);
        expect(fresh.length).toBe(expected.length + 1);
        expect(fresh[0]?.id).toBe("issue_new");
        expect(fresh.slice(1).map((i) => i.id)).toEqual(expected.map((i) => i.id));
      } finally {
        await close();
      }
    });

    it("nextNumber is monotonic per team and follows max+1 (gaps never backfilled)", async () => {
      const { repo, db, close } = await setup();
      try {
        expect(await repo.nextNumber(teamB)).toBe(3); // seeded ops issues hold 1-2
        const first = await repo.create(
          {
            teamId: teamB,
            title: "ops a",
            description: "",
            stateId: stOps,
            priority: 0,
            creatorId: ada,
          },
          orderKey(0),
        );
        expect(first.number).toBe(3);
        const second = await repo.create(
          {
            teamId: teamB,
            title: "ops b",
            description: "",
            stateId: stOps,
            priority: 0,
            creatorId: ada,
          },
          orderKey(1),
        );
        expect(second.number).toBe(4);
        expect(await repo.nextNumber(teamB)).toBe(5);

        // allocation is max+1, not count+1: a direct-insert row with number 99
        // pushes the next allocation to 100 (ADR 0006)
        await db.insert(issues).values({
          id: issueId("issue_b99"),
          teamId: teamB,
          number: 99,
          title: "gap maker",
          description: "",
          stateId: stOps,
          priority: 0,
          estimate: null,
          assigneeId: null,
          creatorId: ada,
          parentId: null,
          order: orderKey(0),
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
        const third = await repo.create(
          {
            teamId: teamB,
            title: "ops c",
            description: "",
            stateId: stOps,
            priority: 0,
            creatorId: ada,
          },
          orderKey(2),
        );
        expect(third.number).toBe(100);
      } finally {
        await close();
      }
    });

    it("create retries a unique violation once, then raises ConflictError", async () => {
      const { repo, close } = await setup();
      try {
        // pglite has no concurrent writer; force the same 23505 path the
        // (teamId, number) race takes by pinning an id that already exists.
        // The wrapper is constraint-agnostic: attempt → violation → retry →
        // violation again → ConflictError.
        const err: unknown = await repo
          .create(
            {
              id: issueId("issue_1"),
              teamId: teamA,
              title: "collision",
              description: "",
              stateId: stReady,
              priority: 0,
              creatorId: ada,
            },
            orderKey(0),
          )
          .then(
            () => null,
            (e) => e,
          );
        expect(err).toBeInstanceOf(Error);
        expect((err as { code?: string }).code).toBe("conflict");
        expect((err as Error).name).toBe("ConflictError");
      } finally {
        await close();
      }
    });

    it("update patches fields, keeps last-write-wins updatedAt, and 404s when missing", async () => {
      const { repo, close } = await setup();
      try {
        const stamp = at(50 * minute);
        const updated = await repo.update(issueId("issue_1"), {
          title: "renamed",
          estimate: 3,
          assigneeId: grace,
          priority: 4,
          updatedAt: stamp,
        });
        expect(updated.title).toBe("renamed");
        expect(updated.estimate).toBe(3);
        expect(updated.assigneeId).toBe(grace);
        expect(updated.priority).toBe(4);
        expect(updated.updatedAt).toEqual(stamp);
        expect((await repo.byId(issueId("issue_1")))?.title).toBe("renamed");

        // explicit null clears a nullable
        const cleared = await repo.update(issueId("issue_1"), { estimate: null, assigneeId: null });
        expect(cleared.estimate).toBeNull();
        expect(cleared.assigneeId).toBeNull();

        await expect(repo.update(issueId("issue_missing"), { title: "x" })).rejects.toThrowError(
          /not found/,
        );
      } finally {
        await close();
      }
    });

    it("move sets the order key (and optionally the state), 404s when missing", async () => {
      const { repo, close } = await setup();
      try {
        const moved = await repo.move(issueId("issue_1"), orderKey(42.5));
        expect(moved.order).toBe("42.5");
        expect(moved.stateId).toBe(stReady);

        const movedWithState = await repo.move(issueId("issue_1"), orderKey(43), stDone);
        expect(movedWithState.order).toBe("43");
        expect(movedWithState.stateId).toBe(stDone);

        await expect(repo.move(issueId("issue_missing"), orderKey(1))).rejects.toThrowError(
          /not found/,
        );
        // garbage order keys are a ValidationError, not a corrupt row
        await expect(repo.move(issueId("issue_1"), "abc" as OrderKey)).rejects.toThrowError(
          ValidationError,
        );
      } finally {
        await close();
      }
    });

    it("setLabels transactionally replaces the whole label set", async () => {
      const { repo, close } = await setup();
      try {
        const replaced = await repo.setLabels(issueId("issue_1"), [lbPerf]);
        expect(replaced.labelIds).toEqual([lbPerf]);
        expect((await repo.byId(issueId("issue_1")))?.labelIds).toEqual([lbPerf]);

        const cleared = await repo.setLabels(issueId("issue_1"), []);
        expect(cleared.labelIds).toEqual([]);

        await expect(repo.setLabels(issueId("issue_missing"), [])).rejects.toThrowError(
          /not found/,
        );
      } finally {
        await close();
      }
    });

    it("archive stamps and clears archivedAt; the repo applies no hidden filtering", async () => {
      const { repo, close } = await setup();
      try {
        const stamp = at(99 * minute);
        const archived = await repo.archive(issueId("issue_1"), stamp);
        expect(archived.archivedAt).toEqual(stamp);

        // archived rows are still listed — exclusion is a caller-side filter,
        // never a hidden repo behavior
        const listed = await repo.list({
          filter: AND(),
          display: display(),
          cursor: null,
          limit: 100,
        });
        expect(listed.items.some((i) => i.id === "issue_1")).toBe(true);

        const unarchived = await repo.archive(issueId("issue_1"), null);
        expect(unarchived.archivedAt).toBeNull();

        await expect(repo.archive(issueId("issue_missing"), stamp)).rejects.toThrowError(
          /not found/,
        );
      } finally {
        await close();
      }
    });

    it("relations round-trip", async () => {
      const { repo, db, close } = await setup();
      try {
        await db.insert(issueRelations).values([
          { issueId: issueId("issue_1"), relatedIssueId: issueId("issue_2"), type: "blocks" },
          { issueId: issueId("issue_1"), relatedIssueId: issueId("issue_3"), type: "related" },
          { issueId: issueId("issue_2"), relatedIssueId: issueId("issue_1"), type: "blocked_by" },
        ]);
        expect(await repo.relations(issueId("issue_1"))).toEqual([
          { issueId: issueId("issue_1"), relatedIssueId: issueId("issue_2"), type: "blocks" },
          { issueId: issueId("issue_1"), relatedIssueId: issueId("issue_3"), type: "related" },
        ]);
        expect(await repo.relations(issueId("issue_9"))).toEqual([]);
      } finally {
        await close();
      }
    });

    it("rejects garbage cursors and invalid limits with ValidationError", async () => {
      const { repo, close } = await setup();
      try {
        await expect(
          repo.list({
            filter: AND(),
            display: display(),
            cursor: "!!!not-base64url!!!",
            limit: 10,
          }),
        ).rejects.toThrowError(ValidationError);

        const wrongShape = Buffer.from(JSON.stringify({ foo: 1 }), "utf8").toString("base64url");
        await expect(
          repo.list({ filter: AND(), display: display(), cursor: wrongShape, limit: 10 }),
        ).rejects.toThrowError(ValidationError);

        const roundTrip = serializeCursor({ sk: 7, id: "issue_1" });
        expect(parseCursor(roundTrip)).toEqual({ sk: 7, id: "issue_1" });

        await expect(
          repo.list({ filter: AND(), display: display(), cursor: null, limit: 0 }),
        ).rejects.toThrowError(ValidationError);
      } finally {
        await close();
      }
    });
  });
};
