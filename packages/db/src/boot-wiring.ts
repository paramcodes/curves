/**
 * Boot wiring for scripts/boot-check.mjs (phase-1 acceptance: "boot check
 * constructs schema + repositories"). Creates a throwaway pglite database,
 * applies real migrations, instantiates every repository and the rollover
 * job, runs one trivial query through a repo, and closes. Run via tsx from
 * the root boot check — exit 0 means the wiring constructs.
 */

import { createCycleRolloverJob } from "./jobs/rollover.job";
import { createActivityRepo } from "./repos/activity.repo";
import { createCommentRepo } from "./repos/comment.repo";
import { createCycleRepo } from "./repos/cycle.repo";
import { createIssueRepo } from "./repos/issue.repo";
import { createWorkflowStateRepo } from "./repos/state.repo";
import { createTeamRepo } from "./repos/team.repo";
import { createTestDb } from "./test-db";

const main = async (): Promise<void> => {
  const { db, close } = await createTestDb();
  try {
    const teamRepo = createTeamRepo(db);
    createIssueRepo(db);
    createWorkflowStateRepo(db);
    createCycleRepo(db);
    createCommentRepo(db);
    createActivityRepo(db);
    createCycleRolloverJob(db);
    const teams = await teamRepo.list();
    if (!Array.isArray(teams)) {
      throw new Error("teamRepo.list() did not construct a working query");
    }
    console.log(`boot-wiring: OK (repos + job construct; teams query returned ${teams.length})`);
  } finally {
    await close();
  }
};

main().catch((err: unknown) => {
  console.error("boot-wiring: FAIL —", err instanceof Error ? err.message : err);
  process.exit(1);
});
