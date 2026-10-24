import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  // integration tests colocate with the schema but must never enter generation
  schema: "./src/schema/!(schema.integration.test).ts",
  out: "./src/migrations",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost/curves",
  },
  // generate is a pure file transform — must never need a live database
  strict: false,
  verbose: false,
});
