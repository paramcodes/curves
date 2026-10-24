import { issueRepoContract } from "../contracts/issue-repo.contract";
import { createTestDb } from "../test-db";
import { createIssueRepo } from "./issue.repo";

// Run the importable behavioral suite against fresh pglite per test.
issueRepoContract(async () => {
  const { db, close } = await createTestDb();
  return { repo: createIssueRepo(db), db, close };
});
