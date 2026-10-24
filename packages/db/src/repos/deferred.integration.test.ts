import { deferredReposContract } from "../contracts/deferred-repos.contract";
import { createTestDb } from "../test-db";
import { createLabelRepo } from "./label.repo";
import { createMilestoneRepo } from "./milestone.repo";
import { createNotificationRepo } from "./notification.repo";
import { createProjectRepo } from "./project.repo";
import { createViewRepo } from "./view.repo";

// Run the importable behavioral suite against fresh pglite per test.
deferredReposContract(async () => {
  const { db, close } = await createTestDb();
  return {
    labelRepo: createLabelRepo(db),
    projectRepo: createProjectRepo(db),
    milestoneRepo: createMilestoneRepo(db),
    viewRepo: createViewRepo(db),
    notificationRepo: createNotificationRepo(db),
    db,
    close,
  };
});
