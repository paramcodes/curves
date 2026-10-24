import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { allTables, EXPECTED_TABLE_COUNT } from "./test-db";

const PINNED_TABLES = [
  "accounts",
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
  "sessions",
  "states",
  "team_members",
  "teams",
  "users",
  "verifications",
  "views",
];

/**
 * The truncate-reset safety net: the derived table list must exactly match the
 * schema. If this fails, someone added/removed a table without updating
 * test-db.ts's schemaModules — a silent miss would leak rows between tests.
 */
describe("resetDb table derivation", () => {
  it("derives exactly the 21 schema tables, no more, no fewer", () => {
    expect(EXPECTED_TABLE_COUNT).toBe(21);
    expect(allTables.map(getTableName).sort()).toEqual(PINNED_TABLES);
  });
});
