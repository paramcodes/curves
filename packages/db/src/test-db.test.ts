import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { allTables, EXPECTED_TABLE_COUNT } from "./test-db";

const PINNED_TABLES = [
  "activities",
  "comments",
  "cycle_issues",
  "cycles",
  "issue_labels",
  "issue_relations",
  "issues",
  "labels",
  "milestones",
  "notifications",
  "project_issues",
  "projects",
  "reactions",
  "states",
  "team_members",
  "teams",
  "users",
  "views",
];

/**
 * The truncate-reset safety net: the derived table list must exactly match the
 * schema. If this fails, someone added/removed a table without updating
 * test-db.ts's schemaModules — a silent miss would leak rows between tests.
 */
describe("resetDb table derivation", () => {
  it("derives exactly the 18 schema tables, no more, no fewer", () => {
    expect(EXPECTED_TABLE_COUNT).toBe(18);
    expect(allTables.map(getTableName)).toEqual(PINNED_TABLES);
  });
});
