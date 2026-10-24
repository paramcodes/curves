import { issueId, stateId, teamId, userId, viewId } from "@curves/domain/core/ids";
import type { FilterSpec } from "@curves/domain/filters/filter.types";
import { orderKey } from "@curves/domain/issues/ordering";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "../test-db";
import { issues } from "./issues";
import { states } from "./states";
import { teams } from "./teams";
import { users } from "./users";
import { views } from "./views";

const T0 = new Date("2026-10-24T10:00:00.000Z");

const nestedFilter: FilterSpec = {
  kind: "group",
  op: "and",
  children: [
    { kind: "cond", key: "priority", op: "gte", value: 3 },
    {
      kind: "group",
      op: "or",
      children: [
        { kind: "cond", key: "assignee", op: "eq", value: "user_ada" },
        { kind: "cond", key: "state", op: "in", value: ["st_doing"] },
      ],
    },
  ],
};

describe("schema integration (pglite)", () => {
  it("migrates, round-trips an issue graph, and preserves a nested FilterSpec in jsonb", async () => {
    const { db, close } = await createTestDb();
    try {
      await db.insert(users).values({
        id: userId("user_ada"),
        name: "Ada",
        email: "ada@example.com",
        avatarUrl: null,
        createdAt: T0,
      });
      await db.insert(teams).values({
        id: teamId("team_eng"),
        key: "ENG",
        name: "Engineering",
      });
      await db.insert(states).values([
        {
          id: stateId("st_backlog"),
          teamId: teamId("team_eng"),
          name: "Backlog",
          category: "backlog",
          position: 0,
        },
        {
          id: stateId("st_doing"),
          teamId: teamId("team_eng"),
          name: "In Progress",
          category: "started",
          position: 1,
        },
      ]);
      await db.insert(issues).values({
        id: issueId("issue_1"),
        teamId: teamId("team_eng"),
        number: 101,
        title: "Fix the curve",
        description: "It bends the wrong way",
        stateId: stateId("st_doing"),
        priority: 3,
        estimate: 5,
        assigneeId: userId("user_ada"),
        creatorId: userId("user_ada"),
        parentId: null,
        order: orderKey(0),
        projectId: null,
        milestoneId: null,
        cycleId: null,
        createdAt: T0,
        updatedAt: T0,
        startedAt: T0,
        completedAt: null,
        canceledAt: null,
        archivedAt: null,
      });

      const [issue] = await db
        .select()
        .from(issues)
        .where(eq(issues.id, issueId("issue_1")));
      expect(issue).toBeDefined();
      expect(issue?.number).toBe(101);
      expect(issue?.title).toBe("Fix the curve");
      expect(issue?.priority).toBe(3);
      expect(issue?.estimate).toBe(5);
      expect(issue?.assigneeId).toBe("user_ada");
      expect(issue?.order).toBe("0");
      // nullable + timestamptz round-trip
      expect(issue?.completedAt).toBeNull();
      expect(issue?.startedAt).toEqual(T0);
      expect(issue?.createdAt).toEqual(T0);

      // the per-team unique constraint really is enforced
      await expect(
        db.insert(issues).values({
          id: issueId("issue_2"),
          teamId: teamId("team_eng"),
          number: 101,
          title: "Duplicate number",
          description: "",
          stateId: stateId("st_backlog"),
          priority: 0,
          estimate: null,
          assigneeId: null,
          creatorId: userId("user_ada"),
          parentId: null,
          order: orderKey(1),
          projectId: null,
          milestoneId: null,
          cycleId: null,
          createdAt: T0,
          updatedAt: T0,
          startedAt: null,
          completedAt: null,
          canceledAt: null,
          archivedAt: null,
        }),
      ).rejects.toThrow();

      await db.insert(views).values({
        id: viewId("view_1"),
        ownerId: userId("user_ada"),
        teamId: null,
        name: "My issues",
        filter: nestedFilter,
        display: { groupBy: "status", sortBy: "priority", direction: "desc", showSubIssues: false },
        isTeamDefault: false,
      });
      const [view] = await db
        .select()
        .from(views)
        .where(eq(views.id, viewId("view_1")));
      expect(view).toBeDefined();
      expect(view?.filter).toEqual(nestedFilter);
      expect(view?.display).toEqual({
        groupBy: "status",
        sortBy: "priority",
        direction: "desc",
        showSubIssues: false,
      });
      expect(view?.teamId).toBeNull();
    } finally {
      await close();
    }
  });
});
