import { defineConfig } from "vitest/config";

/** Integration tier: pglite-backed tests only (run via test:integration in verify:full). */
export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
    // Each file shares ONE pglite instance (phase-1 exit S5): WASM init +
    // migrations run once in beforeAll, tests truncate-reset. hookTimeout
    // stays generous because migrations still run once per file. But a single
    // test on the WARM shared db is just SQL + truncate — anything slower
    // than 30s is a regression signal, not an expected cold-start cost.
    testTimeout: 30_000,
    hookTimeout: 90_000,
  },
});
