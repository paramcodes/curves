export type FilterKey =
  | "state"
  | "priority"
  | "assignee"
  | "creator"
  | "label"
  | "project"
  | "cycle"
  | "team"
  | "estimate"
  | "created"
  | "updated";

export type CondOp = "eq" | "neq" | "in" | "nin" | "gt" | "lt" | "gte" | "lte" | "exists";

/** Permissive by design: mixed arrays are not rejected here — `evaluate` gives them semantics. */
export type FilterValue = string | number | null | Array<string | number>;

export interface FilterGroup {
  kind: "group";
  op: "and" | "or";
  children: FilterSpec[];
}

export interface FilterCondition {
  kind: "cond";
  key: FilterKey;
  op: CondOp;
  value: FilterValue;
}

export type FilterSpec = FilterGroup | FilterCondition;
