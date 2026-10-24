import { defineConfig } from "vitest/config";

/** Integration tier: pglite-backed tests only (run via test:integration in verify:full). */
export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
    // Each file shares ONE pglite instance (phase-1 exit S5): WASM init +
    // migrations run once in beforeAll, tests truncate-reset. hookTimeout is
    // generous on purpose: it only covers cold start (WASM compile + 2
    // migrations), which contended across all parallel files once the api
    // package grew its own integration tier — 90s was observed to starve.
    // But a single TEST on the WARM shared db is just SQL + truncate —
    // anything slower than 30s is a regression signal, not a cold-start cost.
    testTimeout: 30_000,
    hookTimeout: 180_000,
    // Integration files run serially: cold pglite WASM instantiations across
    // packages in parallel starved this box and timed out a beforeAll once
    // (observed phase-2 slice 3) — predictable beats parallel-fast here.
    fileParallelism: false,
  },
});
