import { afterAll, beforeAll } from "vitest";
import { deferredReposContract } from "../contracts/deferred-repos.contract";
import { createSharedTestDb } from "../test-db";
import { createLabelRepo } from "./label.repo";
import { createMilestoneRepo } from "./milestone.repo";
import { createNotificationRepo } from "./notification.repo";
import { createProjectRepo } from "./project.repo";
import { createViewRepo } from "./view.repo";

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
deferredReposContract(async () => {
  await shared.reset();
  return {
    labelRepo: createLabelRepo(shared.db),
    projectRepo: createProjectRepo(shared.db),
    milestoneRepo: createMilestoneRepo(shared.db),
    viewRepo: createViewRepo(shared.db),
    notificationRepo: createNotificationRepo(shared.db),
    db: shared.db,
    close: async () => {},
  };
});
