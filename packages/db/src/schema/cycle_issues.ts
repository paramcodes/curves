import type { CycleId, IssueId } from "@curves/domain/core/ids";
import { index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { cycles } from "./cycles";
import { issues } from "./issues";

export const cycleIssues = pgTable(
  "cycle_issues",
  {
    cycleId: text()
      .$type<CycleId>()
      .notNull()
      .references(() => cycles.id),
    issueId: text()
      .$type<IssueId>()
      .notNull()
      .references(() => issues.id),
  },
  (t) => [
    primaryKey({ columns: [t.cycleId, t.issueId] }),
    index("cycle_issues_issue_idx").on(t.issueId),
  ],
);
