import { defineConfig } from "vitest/config";

/** Unit tier: everything colocated EXCEPT integration tests (pglite tier). */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts", "**/node_modules/**"],
  },
});
