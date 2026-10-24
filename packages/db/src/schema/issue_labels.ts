import type { IssueId, LabelId } from "@curves/domain/core/ids";
import { index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { issues } from "./issues";
import { labels } from "./labels";

export const issueLabels = pgTable(
  "issue_labels",
  {
    issueId: text()
      .$type<IssueId>()
      .notNull()
      .references(() => issues.id),
    labelId: text()
      .$type<LabelId>()
      .notNull()
      .references(() => labels.id),
  },
  (t) => [
    primaryKey({ columns: [t.issueId, t.labelId] }),
    index("issue_labels_label_idx").on(t.labelId),
  ],
);
