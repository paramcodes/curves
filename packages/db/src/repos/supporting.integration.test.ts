import { afterAll, beforeAll } from "vitest";
import { supportingReposContract } from "../contracts/supporting-repos.contract";
import { createSharedTestDb } from "../test-db";
import { createActivityRepo } from "./activity.repo";
import { createCommentRepo } from "./comment.repo";
import { createCycleRepo } from "./cycle.repo";
import { createWorkflowStateRepo } from "./state.repo";
import { createTeamRepo } from "./team.repo";

// One shared pglite per FILE (phase-1 exit S5): WASM init + migrations run
// once; the contract's per-test makeRepos factory resets (truncate) first so
// each test still starts from the bare schema before its fixture seed. The
// contract's close() must NOT close the shared instance — it is a no-op here
// and the file owns the real close.
let shared: Awaited<ReturnType<typeof createSharedTestDb>>;

beforeAll(async () => {
  shared = await createSharedTestDb();
});
afterAll(async () => {
  await shared.close();
});

// Run the importable behavioral suite against the reset shared db per test.
supportingReposContract(async () => {
  await shared.reset();
  return {
    teamRepo: createTeamRepo(shared.db),
    stateRepo: createWorkflowStateRepo(shared.db),
    cycleRepo: createCycleRepo(shared.db),
    commentRepo: createCommentRepo(shared.db),
    activityRepo: createActivityRepo(shared.db),
    db: shared.db,
    close: async () => {},
  };
});
