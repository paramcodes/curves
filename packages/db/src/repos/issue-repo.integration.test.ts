import {
  issueId as issueIdOf,
  stateId as stateIdOf,
  teamId as teamIdOf,
  userId as userIdOf,
} from "@curves/domain/core/ids";
import { orderKey } from "@curves/domain/issues/ordering";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { issueRepoContract } from "../contracts/issue-repo.contract";
import { issues } from "../schema/issues";
import { states } from "../schema/states";
import { teams } from "../schema/teams";
import { users } from "../schema/users";
import { createSharedTestDb } from "../test-db";
import { createIssueRepo } from "./issue.repo";

// One shared pglite per FILE (phase-1 exit S5): WASM init + migrations run
// once; the contract's per-test makeRepo factory resets (truncate) first so
// each test still starts empty. The contract's close() must NOT close the
// shared instance — it is a no-op here and the file owns the real close.
let shared: Awaited<ReturnType<typeof createSharedTestDb>>;

beforeAll(async () => {
  shared = await createSharedTestDb();
});
afterAll(async () => {
  await shared.close();
});

issueRepoContract(async () => {
  await shared.reset();
  return { repo: createIssueRepo(shared.db), db: shared.db, close: async () => {} };
});

/**
 * Query-count guard (phase-2 slice 5b): one issueRepo.list call must stay a
 * FIXED, small number of statements. The repo is the N+1 hazard surface (per
 * page: rows + labels + group counts), and a regression from, say, a per-row
 * label lookup would silently multiply round-trips. Guarded by wrapping the
 * pglite client's .query — every drizzle statement in this path goes through
 * exactly one client.query call (verified against the installed
 * drizzle-orm 0.45.4 pglite session); no transaction/session plumbing wraps a
 * plain read, so the count below IS the statement count.
 */
describe("query-count guard", () => {
  it("one list call with a grouped filter issues at most 4 statements", async () => {
    await shared.reset();
    const db: PgliteDatabase = shared.db;
    const team = teamIdOf("team_qguard");
    await db.insert(users).values({ id: userIdOf("user_qguard"), name: "Q", email: "q@g.dev" });
    await db.insert(teams).values({ id: team, key: "QGD", name: "Query Guard" });
    await db.insert(states).values([
      {
        id: stateIdOf("st_q_ready"),
        teamId: team,
        name: "Ready",
        category: "unstarted",
        position: 0,
      },
      {
        id: stateIdOf("st_q_doing"),
        teamId: team,
        name: "Doing",
        category: "started",
        position: 1,
      },
    ]);
    // six issues across the two states so the page and both groups are populated
    await db.insert(issues).values(
      [0, 1, 2, 3, 4, 5].map((n) => ({
        id: issueIdOf(`issue_qguard_${n}`),
        teamId: team,
        number: n + 1,
        title: `guarded ${n}`,
        description: "",
        stateId: n % 2 === 0 ? stateIdOf("st_q_ready") : stateIdOf("st_q_doing"),
        priority: (n % 3) as 0 | 1 | 2,
        estimate: null,
        assigneeId: null,
        creatorId: userIdOf("user_qguard"),
        parentId: null,
        projectId: null,
        milestoneId: null,
        cycleId: null,
        startedAt: null,
        completedAt: null,
        canceledAt: null,
        archivedAt: null,
        order: orderKey(n),
        createdAt: new Date(0),
        updatedAt: new Date(0),
      })),
    );

    const statements: string[] = [];
    const originalQuery = shared.sql.query.bind(shared.sql);
    shared.sql.query = ((...args: Parameters<typeof originalQuery>) => {
      statements.push(String(args[0]));
      return originalQuery(...args);
    }) as typeof shared.sql.query;

    let result: Awaited<ReturnType<ReturnType<typeof createIssueRepo>["list"]>>;
    try {
      result = await createIssueRepo(db).list({
        filter: {
          kind: "group",
          op: "and",
          children: [{ kind: "cond", key: "team", op: "eq", value: team }],
        },
        display: { groupBy: "status", sortBy: "order", direction: "asc", showSubIssues: false },
        cursor: null,
        limit: 50,
      });
    } finally {
      shared.sql.query = originalQuery as typeof shared.sql.query;
    }

    // exactly the three statements the list path is ALLOWED, each justified:
    //   1. the page select over issues (filter + keyset order + limit n+1)
    //   2. ONE batched label lookup for the whole page (the anti-N+1 contract)
    //   3. ONE group-counts aggregate over the whole filtered set
    // 4 is the ceiling: one spare statement of headroom for a drizzle-internal
    // query, but a 5th means someone added a per-row or per-group round-trip.
    expect(result.items).toHaveLength(6);
    expect(result.groupCounts).toHaveLength(2);
    expect(statements.length).toBeLessThanOrEqual(4);
    expect(statements).toHaveLength(3);
  });
});
