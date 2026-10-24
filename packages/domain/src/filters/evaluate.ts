import type { Issue } from "../issues/issue.types";
import type { FilterCondition, FilterGroup, FilterKey, FilterSpec } from "./filter.types";

/**
 * Pure evaluator for FilterSpec against a single issue — the one place query
 * semantics are defined (UI previews and repo list queries both call this or
 * mirror its table).
 *
 * Semantics:
 * - Groups: "and" is vacuous truth on empty (true), "or" is vacuous falsity on
 *   empty (false); children are evaluated recursively.
 * - Field mapping: state → stateId, priority → priority, assignee → assigneeId,
 *   creator → creatorId, label → labelIds, project → projectId, cycle →
 *   cycleId, team → teamId, estimate → estimate, created/updated → epoch ms
 *   (compare against numeric values).
 * - eq/neq compare the raw value directly, so `eq null` matches an absent
 *   field and `neq <x>` is true for a null field.
 * - Ordering ops (gt/lt/gte/lte) are false on a null field value, require a
 *   scalar value of the same primitive type (string vs number), and are false
 *   for array values.
 * - in/nin take an array value: membership (or non-membership) of the field's
 *   scalar; a non-array value makes the condition false.
 * - label is set-valued: only exists (labelIds non-empty), in (value array
 *   intersects labelIds) and nin (no intersection) mean anything — every other
 *   op on label is false.
 * - exists ignores the value entirely: the field must be non-null.
 */
export const evaluate = (spec: FilterSpec, issue: Issue): boolean =>
  spec.kind === "group" ? evaluateGroup(spec, issue) : evaluateCondition(spec, issue);

const evaluateGroup = (group: FilterGroup, issue: Issue): boolean =>
  group.op === "and"
    ? group.children.every((child) => evaluate(child, issue))
    : group.children.some((child) => evaluate(child, issue));

const fieldValue = (key: FilterKey, issue: Issue): string | number | readonly string[] | null => {
  switch (key) {
    case "state":
      return issue.stateId;
    case "priority":
      return issue.priority;
    case "assignee":
      return issue.assigneeId;
    case "creator":
      return issue.creatorId;
    case "label":
      return issue.labelIds;
    case "project":
      return issue.projectId;
    case "cycle":
      return issue.cycleId;
    case "team":
      return issue.teamId;
    case "estimate":
      return issue.estimate;
    case "created":
      return issue.createdAt.getTime();
    case "updated":
      return issue.updatedAt.getTime();
  }
};

const compare = (
  a: string | number,
  b: string | number,
  op: "gt" | "lt" | "gte" | "lte",
): boolean => {
  switch (op) {
    case "gt":
      return a > b;
    case "lt":
      return a < b;
    case "gte":
      return a >= b;
    case "lte":
      return a <= b;
  }
};

const evaluateLabel = (cond: FilterCondition, ids: readonly string[]): boolean => {
  const value = cond.value;
  if (cond.op === "exists") {
    return ids.length > 0;
  }
  if (cond.op === "in") {
    return Array.isArray(value) && value.some((v) => ids.includes(v as string));
  }
  if (cond.op === "nin") {
    return Array.isArray(value) && !value.some((v) => ids.includes(v as string));
  }
  return false;
};

const evaluateOrdering = (
  value: string | number,
  expected: FilterCondition["value"],
  op: "gt" | "lt" | "gte" | "lte",
): boolean => {
  if (typeof value === "number" && typeof expected === "number") {
    return compare(value, expected, op);
  }
  if (typeof value === "string" && typeof expected === "string") {
    return compare(value, expected, op);
  }
  return false;
};

const evaluateCondition = (cond: FilterCondition, issue: Issue): boolean => {
  if (cond.key === "label") {
    return evaluateLabel(cond, issue.labelIds);
  }
  const value = fieldValue(cond.key, issue);

  switch (cond.op) {
    case "exists":
      return value !== null;
    case "eq":
      return value === cond.value;
    case "neq":
      return value !== cond.value;
    case "in":
      return Array.isArray(cond.value) && cond.value.includes(value as string | number);
    case "nin":
      return Array.isArray(cond.value) && !cond.value.includes(value as string | number);
    default: {
      // remaining ops are gt/lt/gte/lte (exhaustive switch above)
      if (value === null || Array.isArray(value) || Array.isArray(cond.value)) {
        return false;
      }
      // label (the only array-valued field) already returned; safe to narrow
      return evaluateOrdering(value as string | number, cond.value, cond.op);
    }
  }
};
