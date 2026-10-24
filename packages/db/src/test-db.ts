import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { getTableName, sql, Table, type Table as TableType } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./repos/issue.repo";
import * as accountsMod from "./schema/accounts";
import * as activitiesMod from "./schema/activities";
import * as commentsMod from "./schema/comments";
import * as cycleIssuesMod from "./schema/cycle_issues";
import * as cyclesMod from "./schema/cycles";
import * as issueLabelsMod from "./schema/issue_labels";
import * as issueRelationsMod from "./schema/issue_relations";
import * as issuesMod from "./schema/issues";
import * as labelsMod from "./schema/labels";
import * as milestonesMod from "./schema/milestones";
import * as notificationsMod from "./schema/notifications";
import * as projectIssuesMod from "./schema/project_issues";
import * as projectsMod from "./schema/projects";
import * as reactionsMod from "./schema/reactions";
import * as sessionsMod from "./schema/sessions";
import * as statesMod from "./schema/states";
import * as teamMembersMod from "./schema/team_members";
import * as teamsMod from "./schema/teams";
import * as usersMod from "./schema/users";
import * as verificationsMod from "./schema/verifications";
import * as viewsMod from "./schema/views";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/**
 * Every schema module — the reset table list is DERIVED from these exports
 * (not hand-listed), so a table added to an existing module is picked up
 * automatically. Adding a whole NEW module requires appending it here; the
 * EXPECTED_TABLE_COUNT guard in resetDb turns a forgotten module into a loud
 * failure instead of silently leaving rows behind after a truncate.
 */
const schemaModules = [
  accountsMod,
  activitiesMod,
  commentsMod,
  cycleIssuesMod,
  cyclesMod,
  issueLabelsMod,
  issueRelationsMod,
  issuesMod,
  labelsMod,
  milestonesMod,
  notificationsMod,
  projectIssuesMod,
  projectsMod,
  reactionsMod,
  statesMod,
  teamMembersMod,
  teamsMod,
  sessionsMod,
  usersMod,
  verificationsMod,
  viewsMod,
] as const;

/**
 * The drizzle pglite instance type AS THIS PACKAGE resolves drizzle-orm.
 * api must type its `createAuth` db param with THIS (not its own drizzle
 * import): pnpm resolves api's drizzle-orm separately from db's (different
 * peer hashes), and the two copies' PgliteDatabase types are nominal —
 * structurally incompatible — across the boundary.
 */
export type DbInstance = PgliteDatabase;

/** One schema module per table today — the count the guard pins. */
export const EXPECTED_TABLE_COUNT = schemaModules.length;

/** All drizzle table objects exported by src/schema, derived not enumerated. */
export const allTables: TableType[] = schemaModules.flatMap((mod) =>
  Object.values(mod).filter((value): value is TableType => value instanceof Table),
);

/**
 * Fresh in-memory pglite + drizzle, migrated to the current baseline.
 *
 * Migration application uses drizzle's own pglite migrator (the robust path):
 * it reads the generated `meta/_journal.json`, runs each `.sql` file in order,
 * and records applied entries in `drizzle.__drizzle_migrations` — so partial
 * failure semantics and statement splitting match production migrators instead
 * of a hand-rolled file loop. Each call gets its own database; nothing is shared.
 */
export const createTestDb = async () => {
  const client = new PGlite();
  // casing must match drizzle.config.ts — the generated DDL is snake_case
  const db = drizzle(client, { casing: "snake_case" });
  await migrate(db, { migrationsFolder });
  return {
    db,
    sql: client,
    close: async () => {
      await client.close();
    },
  };
};

/**
 * Truncate every table in one statement. CASCADE resolves FK ordering and
 * RESTART IDENTITY clears sequences (none exist today — all ids are text —
 * but a future serial column must not leak state across tests). The derived
 * list is guarded: a table missing from `allTables` would keep rows between
 * tests and corrupt contracts with ghost data, so a count mismatch throws
 * BEFORE truncating — a new table cannot be silently missed.
 */
export const resetDb = async (db: Db): Promise<void> => {
  if (allTables.length !== 21) {
    throw new Error(
      `resetDb: derived ${allTables.length} tables but 21 are pinned — a schema ` +
        "table was added/removed without updating test-db.ts's schemaModules list",
    );
  }
  const tableRefs = allTables.map((t) => sql.identifier(getTableName(t)));
  await db.execute(sql`TRUNCATE TABLE ${sql.join(tableRefs, sql`, `)} RESTART IDENTITY CASCADE`);
};

/**
 * One shared instance per test FILE: WASM init and migrations run once, each
 * test starts from `reset()` — truncate instead of re-migrate. Tests within a
 * file run sequentially, so nothing inside a file races on the instance;
 * parallel files each hold their own.
 */
export const createSharedTestDb = async (): Promise<{
  db: PgliteDatabase;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}> => {
  const shared = await createTestDb();
  return {
    db: shared.db,
    reset: () => resetDb(shared.db),
    close: shared.close,
  };
};
