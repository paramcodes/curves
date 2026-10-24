import { rolloverJobContract } from "../contracts/rollover-job.contract";
import { createTestDb } from "../test-db";
import { createCycleRolloverJob } from "./rollover.job";

// Run the importable behavioral suite against fresh pglite per test.
rolloverJobContract(async () => {
  const { db, close } = await createTestDb();
  return { job: createCycleRolloverJob(db), db, close };
});
