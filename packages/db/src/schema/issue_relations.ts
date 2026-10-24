import type { IssueId } from "@curves/domain/core/ids";
import type { RelationType } from "@curves/domain/issues/issue.types";
import { index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { issues } from "./issues";

export const issueRelations = pgTable(
  "issue_relations",
  {
    issueId: text()
      .$type<IssueId>()
      .notNull()
      .references(() => issues.id),
    relatedIssueId: text()
      .$type<IssueId>()
      .notNull()
      .references(() => issues.id),
    type: text().$type<RelationType>().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.issueId, t.relatedIssueId, t.type] }),
    index("issue_relations_related_idx").on(t.relatedIssueId),
  ],
);
