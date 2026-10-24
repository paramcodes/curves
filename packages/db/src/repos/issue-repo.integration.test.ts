import { afterAll, beforeAll } from "vitest";
import { issueRepoContract } from "../contracts/issue-repo.contract";
import { createSharedTestDb } from "../test-db";
import { createIssueRepo } from "./issue.repo";

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

issueRepoContract(async () => {
  await shared.reset();
  return { repo: createIssueRepo(shared.db), db: shared.db, close: async () => {} };
});
