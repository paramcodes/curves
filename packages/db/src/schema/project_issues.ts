import type { IssueId, ProjectId } from "@curves/domain/core/ids";
import { index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { issues } from "./issues";
import { projects } from "./projects";

export const projectIssues = pgTable(
  "project_issues",
  {
    projectId: text()
      .$type<ProjectId>()
      .notNull()
      .references(() => projects.id),
    issueId: text()
      .$type<IssueId>()
      .notNull()
      .references(() => issues.id),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.issueId] }),
    index("project_issues_issue_idx").on(t.issueId),
  ],
);
