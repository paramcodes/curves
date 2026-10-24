import { afterAll, beforeAll } from "vitest";
import { rolloverJobContract } from "../contracts/rollover-job.contract";
import { createSharedTestDb } from "../test-db";
import { createCycleRolloverJob } from "./rollover.job";

// One shared pglite per FILE (phase-1 exit S5): WASM init + migrations run
// once; the contract's per-test makeRepo factory resets (truncate) first so
// each test still starts empty. The contract's close() must NOT close the
// shared instance — it is a no-op here and the file owns the real close.
let shared: Awaited<ReturnType<typeof createSharedTestDb>>;

beforeAll(async () => {
  shared = await createSharedTestDb();
});
afterAll(async () => {
  await shared.close();
});

rolloverJobContract(async () => {
  await shared.reset();
  return { job: createCycleRolloverJob(shared.db), db: shared.db, close: async () => {} };
});
