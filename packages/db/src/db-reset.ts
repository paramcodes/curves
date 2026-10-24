import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Clock } from "@curves/domain/core/clock";
import { fixedClock } from "@curves/domain/core/clock";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./repos/issue.repo";
import { runSeed, type SeedSummary } from "./seed/seed";

/** The seed anchor — the same clock the seed integration test pins. */
const ANCHOR: Clock = fixedClock("2026-10-24T09:00:00Z");

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/** File target lives under the package cwd; the root .gitignore covers it. */
const DEFAULT_FILE_DIR = resolve(process.cwd(), ".pglite/curves");

interface ResetResult {
  target: string;
  summary: SeedSummary;
}

const resetPgliteFile = async (): Promise<ResetResult> => {
  rmSync(DEFAULT_FILE_DIR, { recursive: true, force: true });
  // PGlite does not create intermediate directories — the parent must exist.
  mkdirSync(dirname(DEFAULT_FILE_DIR), { recursive: true });
  const client = new PGlite(DEFAULT_FILE_DIR);
  try {
    const db = drizzle(client, { casing: "snake_case" });
    await migrate(db, { migrationsFolder });
    return { target: `pglite file ${DEFAULT_FILE_DIR}`, summary: await runSeed(db, ANCHOR) };
  } finally {
    await client.close();
  }
};

/** Minimal structural shape of the pg bits we use (pg is an optional dep). */
interface PgClient {
  connect(): Promise<void>;
  query(sql: string): Promise<unknown>;
  end(): Promise<unknown>;
}

/**
 * Postgres target. `pg` is not a dependency yet (Phase 2 brings the dev DB),
 * so both the driver and its client are imported dynamically via variable
 * specifiers — no static type resolution, one runtime failure mode with a
 * clear message. This path is unexercised until a Postgres database exists.
 */
const resetPostgres = async (url: string): Promise<ResetResult> => {
  if (/prod/i.test(url) || process.env.NODE_ENV === "production") {
    throw new Error("db:reset refuses to run against a production-looking DATABASE_URL");
  }
  const pgSpecifier = "pg";
  const driverSpecifier = "drizzle-orm/node-postgres";
  const migratorSpecifier = "drizzle-orm/node-postgres/migrator";
  let pgModule: { Client: new (config: { connectionString: string }) => PgClient };
  try {
    pgModule = (await import(pgSpecifier)) as typeof pgModule;
  } catch {
    throw new Error(
      "DATABASE_URL is set but the `pg` package is not installed — add it when the Phase 2 dev database exists",
    );
  }
  const driver = (await import(driverSpecifier)) as {
    drizzle: (client: PgClient, config: { casing: "snake_case" }) => Db;
  };
  const migrator = (await import(migratorSpecifier)) as {
    migrate: (db: Db, config: { migrationsFolder: string }) => Promise<void>;
  };
  const client = new pgModule.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("drop schema public cascade");
    await client.query("create schema public");
    const db = driver.drizzle(client, { casing: "snake_case" });
    await migrator.migrate(db, { migrationsFolder });
    return {
      target: `postgres ${url.replace(/:\/\/[^@]*@/, "://***@")}`,
      summary: await runSeed(db, ANCHOR),
    };
  } finally {
    await client.end();
  }
};

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL;
  const result =
    databaseUrl === undefined || databaseUrl === ""
      ? await resetPgliteFile()
      : await resetPostgres(databaseUrl);
  console.log(`[db:reset] target: ${result.target}`);
  console.log("[db:reset] seeded:", JSON.stringify(result.summary));
};

main().catch((err: unknown) => {
  console.error("[db:reset] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
