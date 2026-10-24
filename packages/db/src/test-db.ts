import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "migrations");

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
  const sql = new PGlite();
  // casing must match drizzle.config.ts — the generated DDL is snake_case
  const db = drizzle(sql, { casing: "snake_case" });
  await migrate(db, { migrationsFolder });
  return {
    db,
    sql,
    close: async () => {
      await sql.close();
    },
  };
};
