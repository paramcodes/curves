import { supportingReposContract } from "../contracts/supporting-repos.contract";
import { createTestDb } from "../test-db";
import { createActivityRepo } from "./activity.repo";
import { createCommentRepo } from "./comment.repo";
import { createCycleRepo } from "./cycle.repo";
import { createWorkflowStateRepo } from "./state.repo";
import { createTeamRepo } from "./team.repo";

// Run the importable behavioral suite against fresh pglite per test.
supportingReposContract(async () => {
  const { db, close } = await createTestDb();
  return {
    teamRepo: createTeamRepo(db),
    stateRepo: createWorkflowStateRepo(db),
    cycleRepo: createCycleRepo(db),
    commentRepo: createCommentRepo(db),
    activityRepo: createActivityRepo(db),
    db,
    close,
  };
});
