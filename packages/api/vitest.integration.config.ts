import { defineConfig } from "vitest/config";

/** Integration tier: pglite-backed tests only (run via test:integration in verify:full). */
export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
    // Same shape as @curves/db's tier: one shared pglite per file (WASM +
    // migrations once), tests truncate-reset — so a single test is just SQL
    // plus auth crypto on a warm instance; 30s is a regression signal.
    testTimeout: 30_000,
    hookTimeout: 180_000,
    // Cold pglite WASM instantiations across packages in parallel starve this
    // box and once timed out the first beforeAll mid-suite (observed phase-2
    // slice 3): integration files run serially — predictable over parallel-fast.
    fileParallelism: false,
  },
});
