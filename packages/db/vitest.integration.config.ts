import { defineConfig } from "vitest/config";

/** Integration tier: pglite-backed tests only (run via test:integration in verify:full). */
export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**"],
    // pglite WASM init + migration application can take seconds cold
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
