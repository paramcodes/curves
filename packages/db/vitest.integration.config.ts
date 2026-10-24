import { defineConfig } from "vitest/config";

/** Integration tier: pglite-backed tests only (run via test:integration in verify:full). */
export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
    // pglite WASM init + migration application can take seconds cold, and
    // test files run in parallel — each file spins up per-test pglite
    // instances, so a single test's real time can triple under 4-way file
    // parallelism. The budget is generous on purpose: a flaky ladder is worse
    // than a slow one.
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
});
