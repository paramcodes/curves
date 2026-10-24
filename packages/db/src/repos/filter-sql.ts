import type { LabelId } from "@curves/domain/core/ids";
import type { FilterCondition, FilterGroup, FilterSpec } from "@curves/domain/filters/filter.types";
import {
  and,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  not,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { issueLabels } from "../schema/issue_labels";
import { issues } from "../schema/issues";

/**
 * Compiles a FilterSpec into a WHERE condition — the SQL mirror of the pure
 * evaluator in `@curves/domain/filters/evaluate` (the one place query semantics
 * are defined; this file never invents its own). The contract suite in
 * contracts/issue-repo.contract.ts cross-checks both over the same fixture.
 *
 * Null semantics, matched op by op with `evaluate`:
 * - eq null → IS NULL; neq null → IS NOT NULL.
 * - neq scalar → IS DISTINCT FROM (a null field is "not equal" in the domain,
 *   where plain `<>` would yield NULL and drop the row).
 * - in/nin are compiled as an explicitly two-valued membership condition and
 *   negated, so a null field matches `nin` (it is not a member of any array
 *   not containing null) exactly like `Array.prototype.includes` does — plain
 *   NOT IN would yield NULL for null fields and drop rows `evaluate` keeps.
 * - gt/lt/gte/lte on a null field are false (SQL NULL comparison yields NULL →
 *   row dropped — same outcome); cross-type operands are false in the domain,
 *   so they compile to `false` here instead of relying on casts.
 * - label is set-valued: exists (non-empty label set), in (intersection), nin
 *   (no intersection) compile to EXISTS / NOT EXISTS on issue_labels; every
 *   other op is `false`, exactly as `evaluate` returns false for them.
 *
 * Returns undefined where the domain evaluates the spec to vacuous truth
 * (empty and-group), so callers can omit the WHERE clause entirely.
 */
export const filterToConditions = (filter: FilterSpec): SQL | undefined =>
  filter.kind === "group" ? groupToSql(filter) : conditionToSql(filter);

const groupToSql = (group: FilterGroup): SQL | undefined => {
  const children = group.children.map((child) => filterToConditions(child));
  if (group.op === "and") {
    const defined = children.filter((c): c is SQL => c !== undefined);
    // "and" is vacuous truth on empty; dropping undefined children (empty
    // and-groups are true) keeps that semantics for non-empty groups too.
    return defined.length === 0 ? undefined : and(...defined);
  }
  // "or" is vacuous falsity on empty; an undefined child (empty and-group) is
  // truthy, which makes the whole disjunction true.
  if (children.some((c) => c === undefined)) {
    return undefined;
  }
  return or(...(children as SQL[])) ?? sql`false`;
};

type ScalarKey = Exclude<FilterCondition["key"], "label">;

/** Field type per key — cross-type operands compile to `false`, like evaluate. */
const FIELD_TYPE: Record<ScalarKey, "string" | "number"> = {
  state: "string",
  assignee: "string",
  creator: "string",
  project: "string",
  cycle: "string",
  team: "string",
  priority: "number",
  estimate: "number",
  created: "number",
  updated: "number",
};

const columnFor = (key: ScalarKey): AnyPgColumn => {
  switch (key) {
    case "state":
      return issues.stateId;
    case "assignee":
      return issues.assigneeId;
    case "creator":
      return issues.creatorId;
    case "project":
      return issues.projectId;
    case "cycle":
      return issues.cycleId;
    case "team":
      return issues.teamId;
    case "priority":
      return issues.priority;
    case "estimate":
      return issues.estimate;
    case "created":
      return issues.createdAt;
    case "updated":
      return issues.updatedAt;
  }
};

const isTimeKey = (key: ScalarKey): boolean => key === "created" || key === "updated";

/** Strict type match, like evaluate's `===` / `includes`: Postgres would happily coerce "3" to 3 — we must not. */
const valueMatches = (key: ScalarKey, v: string | number): boolean => typeof v === FIELD_TYPE[key];

/** created/updated compare epoch-ms numbers against the timestamptz columns. */
const toOperand = (key: ScalarKey, value: string | number): string | number | Date =>
  isTimeKey(key) && typeof value === "number" ? new Date(value) : value;

// Filter values are plain (unbranded) strings/numbers by design; wrapping the
// column in a fragment routes the comparison through drizzle's raw-operand
// overloads instead of fighting the branded column types.
const frag = (col: AnyPgColumn): SQL => sql`${col}`;

/**
 * eq/neq, strictly typed like evaluate's `===` / `!==`: a cross-typed or array
 * operand matches nothing under eq, and differs from every field value under
 * neq (vacuous truth → the predicate is omitted). Postgres would silently
 * coerce "3" into 3 — this guard is why it must not get the chance.
 */
const equalityToSql = (cond: FilterCondition, col: SQL, key: ScalarKey): SQL | undefined => {
  if (cond.value === null) {
    return cond.op === "eq" ? isNull(col) : isNotNull(col);
  }
  const crossTyped = Array.isArray(cond.value) || !valueMatches(key, cond.value);
  if (crossTyped) {
    return cond.op === "eq" ? sql`false` : undefined;
  }
  // valueMatches is opaque to the compiler — the guard above makes this cast total.
  const v = cond.value as string | number;
  if (cond.op === "eq") {
    return eq(col, toOperand(key, v));
  }
  // IS DISTINCT FROM: a null field is "not equal" to any scalar, mirroring
  // `value !== expected` in evaluate (plain <> yields NULL, dropping rows).
  return sql`${col} is distinct from ${toOperand(key, v)}`;
};

const conditionToSql = (cond: FilterCondition): SQL | undefined => {
  if (cond.key === "label") {
    return labelConditionToSql(cond);
  }
  const col = frag(columnFor(cond.key));

  switch (cond.op) {
    case "exists":
      return isNotNull(col);
    case "eq":
    case "neq":
      return equalityToSql(cond, col, cond.key);
    case "in": {
      if (!Array.isArray(cond.value)) {
        return sql`false`;
      }
      return membership(col, cond.key, cond.value, false);
    }
    case "nin": {
      if (!Array.isArray(cond.value)) {
        return sql`false`;
      }
      return membership(col, cond.key, cond.value, true);
    }
    default: {
      // gt/lt/gte/lte
      const expected = cond.value;
      if (
        expected === null ||
        Array.isArray(expected) ||
        typeof expected !== FIELD_TYPE[cond.key]
      ) {
        return sql`false`;
      }
      const operand = toOperand(cond.key, expected);
      switch (cond.op) {
        case "gt":
          return gt(col, operand);
        case "lt":
          return lt(col, operand);
        case "gte":
          return gte(col, operand);
        case "lte":
          return lte(col, operand);
      }
    }
  }
};

/**
 * in/nin membership over an array value, with null handled exactly as
 * `Array.prototype.includes` does. The positive membership condition is built
 * two-valued (IS NULL / IS NOT NULL guard the null field) so `not` over it is
 * exact — that is what keeps `nin` matching null fields, unlike NOT IN.
 */
const membership = (
  col: SQL,
  key: ScalarKey,
  value: Array<string | number>,
  negate: boolean,
): SQL => {
  // evaluate's includes() is strict: cross-typed members never match, so they
  // are dropped before the SQL is built (Postgres would coerce "3" into 3).
  const nonNull = value.filter((v): v is string | number => v !== null && valueMatches(key, v));
  const hasNull = value.some((v) => v === null);
  const operands = nonNull.map((v) => toOperand(key, v));
  let positive: SQL;
  if (nonNull.length === 0) {
    // nothing type-matches: only a null member (if any) can match a null field
    positive = hasNull ? isNull(col) : sql`false`;
  } else {
    positive = hasNull
      ? (or(inArray(col, operands), isNull(col)) as SQL)
      : (and(isNotNull(col), inArray(col, operands)) as SQL);
  }
  return negate ? not(positive) : positive;
};

/**
 * label is set-valued (issue_labels rows): only exists / in / nin mean
 * anything — they compile to EXISTS / NOT EXISTS so per-issue label sets are
 * compared exactly like `evaluate` compares labelIds arrays. Every other op
 * is `false`.
 */
const labelConditionToSql = (cond: FilterCondition): SQL | undefined => {
  // filter values are unbranded strings; the labelId column is branded
  const hasLabelIn = (labelIds: LabelId[]): SQL =>
    sql`exists (select 1 from ${issueLabels} where ${eq(issueLabels.issueId, issues.id)} and ${inArray(issueLabels.labelId, labelIds)})`;

  switch (cond.op) {
    case "exists":
      // domain: labelIds.length > 0 — i.e. at least one label row
      return sql`exists (select 1 from ${issueLabels} where ${eq(issueLabels.issueId, issues.id)})`;
    case "in":
    case "nin": {
      if (!Array.isArray(cond.value)) {
        return sql`false`;
      }
      const ids = cond.value.filter((v): v is string => typeof v === "string") as LabelId[];
      if (ids.length === 0) {
        // empty value array: in → no intersection → false; nin → no
        // intersection → true (undefined = omit the predicate)
        return cond.op === "in" ? sql`false` : undefined;
      }
      return cond.op === "in" ? hasLabelIn(ids) : not(hasLabelIn(ids));
    }
    default:
      return sql`false`;
  }
};
