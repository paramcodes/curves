export interface DisplaySpec {
  groupBy: "status" | "assignee" | "priority" | "label" | "none";
  sortBy: "priority" | "updated" | "created" | "title" | "order";
  direction: "asc" | "desc";
  showSubIssues: boolean;
}
