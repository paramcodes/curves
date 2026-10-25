/**
 * Boot wiring for scripts/boot-check.mjs (phase-2 acceptance: "boot check
 * constructs the full appRouter"). Constructs the assembled router, asserts
 * the registry is the expected size, and drives health.check through a real
 * server-side caller — no database needed (health is ctx-free by design).
 */

import { appRouter } from "./root";
import { createCallerFactory } from "./trpc/trpc";

const EXPECTED_PROCEDURES_MIN = 30; // 12 routers + health; registry.test pins the exact set

const main = async (): Promise<void> => {
  const procedureCount = Object.keys(appRouter._def.procedures).length;
  if (procedureCount < EXPECTED_PROCEDURES_MIN) {
    throw new Error(
      `appRouter has ${procedureCount} procedures, expected >= ${EXPECTED_PROCEDURES_MIN}`,
    );
  }
  const caller = createCallerFactory(appRouter)({
    db: {} as never, // health.check is ctx-free; a full ctx needs a live db (db boot-wiring covers that side)
    session: null,
    user: null,
    auth: {} as never,
  });
  const result = await caller.health.check();
  if (!result?.ok) {
    throw new Error("health.check did not return ok through the caller");
  }
  console.log(
    `api boot-wiring: OK (appRouter constructs; ${procedureCount} procedures; health.check via caller ok)`,
  );
};

try {
  main();
} catch (err) {
  console.error("api boot-wiring: FAIL —", err instanceof Error ? err.message : err);
  process.exit(1);
}
