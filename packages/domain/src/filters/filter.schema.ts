import { z } from "zod";
import { teamId, userId, viewId } from "../core/ids";
import type { DisplaySpec } from "./display.types";
import type { FilterSpec } from "./filter.types";
import type { View } from "./view.types";

const filterValueSchema = z.union([
  z.string(),
  z.number(),
  z.null(),
  z.array(z.union([z.string(), z.number()])),
]);

const filterConditionSchema = z.object({
  kind: z.literal("cond"),
  key: z.enum([
    "state",
    "priority",
    "assignee",
    "creator",
    "label",
    "project",
    "cycle",
    "team",
    "estimate",
    "created",
    "updated",
  ]),
  op: z.enum(["eq", "neq", "in", "nin", "gt", "lt", "gte", "lte", "exists"]),
  value: filterValueSchema,
});

const filterGroupSchema = z.object({
  kind: z.literal("group"),
  op: z.enum(["and", "or"]),
  // Empty groups are legal — `evaluate` defines their semantics (and → true, or → false).
  children: z.array(z.lazy(() => filterSchema)),
});

/** The ONLY accepted wire format for filters (CORE_MODEL section 3). */
export const filterSchema: z.ZodType<FilterSpec> = z.discriminatedUnion("kind", [
  filterGroupSchema,
  filterConditionSchema,
]);

export const displaySchema: z.ZodType<DisplaySpec> = z.object({
  groupBy: z.enum(["status", "assignee", "priority", "label", "none"]),
  sortBy: z.enum(["priority", "updated", "created", "title", "order"]),
  direction: z.enum(["asc", "desc"]),
  showSubIssues: z.boolean(),
});

/** Parses the wire format and brands the ids at the boundary (the ids.ts pattern). */
export const viewSchema: z.ZodType<View> = z.object({
  id: z.string().transform(viewId),
  ownerId: z.string().transform(userId),
  teamId: z
    .string()
    .nullable()
    .transform((s) => (s === null ? null : teamId(s))),
  name: z.string(),
  filter: filterSchema,
  display: displaySchema,
  isTeamDefault: z.boolean(),
});
