import { randomUUID } from "node:crypto";
import { ConflictError, NotFoundError, ValidationError } from "@curves/domain/core/errors";
import {
  type CycleId,
  type IssueId,
  issueId,
  type LabelId,
  type MilestoneId,
  type ProjectId,
  type StateId,
  type TeamId,
  type UserId,
} from "@curves/domain/core/ids";
import type { DisplaySpec } from "@curves/domain/filters/display.types";
import type { Issue, IssueRelation, OrderKey, Priority } from "@curves/domain/issues/issue.types";
import { orderKeyNumber } from "@curves/domain/issues/ordering";
import { and, asc, count, desc, eq, inArray, max, type SQL, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { issueLabels } from "../schema/issue_labels";
import { issueRelations } from "../schema/issue_relations";
import { issues } from "../schema/issues";
import { filterToConditions } from "./filter-sql";
import { createValues, type IssueRow, toDomain } from "./issue.mapper";
import { type ListQuery, type ListResult, parseCursor, serializeCursor } from "./list";
import { isUniqueViolation } from "./pg-errors";

/** Driver-agnostic drizzle handle — pglite in tests, node-postgres in prod. */
export type Db = PgDatabase<PgQueryResultHKT>;

export interface CreateIssueInput {
  /** Deterministic ids for seed/tests; a random UUID otherwise. */
  id?: IssueId;
  teamId: TeamId;
  title: string;
  description: string;
  stateId: StateId;
  priority: Priority;
  estimate?: number | null;
  assigneeId?: UserId | null;
  creatorId: UserId;
  parentId?: IssueId | null;
  projectId?: ProjectId | null;
  milestoneId?: MilestoneId | null;
  cycleId?: CycleId | null;
  labelIds?: LabelId[];
  /** Deterministic clock for seed/tests; defaults to now. */
  createdAt?: Date;
}

export interface IssuePatch {
  title?: string;
  description?: string;
  stateId?: StateId;
  priority?: Priority;
  estimate?: number | null;
  assigneeId?: UserId | null;
  parentId?: IssueId | null;
  projectId?: ProjectId | null;
  milestoneId?: MilestoneId | null;
  cycleId?: CycleId | null;
  /** Last-write-wins stamp; defaults to now when omitted. */
  updatedAt?: Date;
}

/**
 * The issue aggregate repo (CORE_MODEL §5). Rows never leak — everything in
 * and out is a domain type.
 *
 * Filtering honesty: `list` applies exactly the FilterSpec it is given —
 * archived rows are NOT hidden behind the repo's back. (The FilterSpec
 * vocabulary has no `archived` key yet; excluding archived issues is a caller
 * concern until that key exists — flagged as a follow-up vocabulary decision.)
 */
export interface IssueRepo {
  byId(id: IssueId): Promise<Issue | null>;
  list(query: ListQuery): Promise<ListResult<Issue>>;
  create(input: CreateIssueInput, order: OrderKey): Promise<Issue>;
  update(id: IssueId, patch: IssuePatch): Promise<Issue>;
  move(id: IssueId, order: OrderKey, toStateId?: StateId): Promise<Issue>;
  setLabels(id: IssueId, labelIds: LabelId[]): Promise<Issue>;
  archive(id: IssueId, at: Date | null): Promise<Issue>;
  relations(id: IssueId): Promise<IssueRelation[]>;
  nextNumber(teamId: TeamId): Promise<number>;
}

interface SortSpec {
  /** ORDER BY / keyset comparison expression. */
  expr: SQL;
  /** The same value as it goes into the cursor payload. */
  cursorValue: (row: IssueRow) => string | number;
}

const sortFor = (sortBy: DisplaySpec["sortBy"]): SortSpec => {
  switch (sortBy) {
    case "priority":
      return { expr: sql`${issues.priority}`, cursorValue: (r) => r.priority };
    case "updated":
      // epoch ms — matches Date#getTime() so cursors compare numerically
      return {
        expr: sql`extract(epoch from ${issues.updatedAt}) * 1000`,
        cursorValue: (r) => r.updatedAt.getTime(),
      };
    case "created":
      return {
        expr: sql`extract(epoch from ${issues.createdAt}) * 1000`,
        cursorValue: (r) => r.createdAt.getTime(),
      };
    case "title":
      return { expr: sql`${issues.title}`, cursorValue: (r) => r.title };
    case "order":
      // OrderKey strings sort numerically, never lexically ("10" < "2" as text)
      return {
        expr: sql`${issues.order}::double precision`,
        cursorValue: (r) => orderKeyNumber(r.order),
      };
  }
};

const sortGroupCounts = (
  rows: { key: string; count: number }[],
): { key: string; count: number }[] =>
  rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

const assertLimit = (limit: number): void => {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ValidationError(`limit must be a positive integer, got ${limit}`);
  }
};

/**
 * WHERE for one page: the compiled filter, plus keyset continuation past the
 * cursor row — (sortKey, id) strictly beyond it, stable under concurrent
 * inserts regardless of where they sort.
 */
const pageWhere = (
  filterCond: SQL | undefined,
  sort: SortSpec,
  direction: DisplaySpec["direction"],
  cursor: string | null,
): SQL | undefined => {
  if (cursor === null) {
    return filterCond;
  }
  const { sk, id } = parseCursor(cursor);
  const cursorCond =
    direction === "asc"
      ? sql`(${sort.expr}, ${issues.id}) > (${sk}, ${id})`
      : sql`(${sort.expr}, ${issues.id}) < (${sk}, ${id})`;
  return filterCond === undefined ? cursorCond : and(filterCond, cursorCond);
};

const PATCH_KEYS = [
  "title",
  "description",
  "stateId",
  "priority",
  "estimate",
  "assigneeId",
  "parentId",
  "projectId",
  "milestoneId",
  "cycleId",
] as const satisfies readonly (keyof IssuePatch)[];

const takeDefined = <K extends keyof IssuePatch & keyof typeof issues.$inferInsert>(
  set: Partial<typeof issues.$inferInsert>,
  patch: IssuePatch,
  key: K,
): void => {
  const value = patch[key];
  if (value !== undefined) {
    set[key] = value;
  }
};

/** Patch → insert columns; updatedAt defaults to now (last-write-wins stamp). */
const patchToSet = (patch: IssuePatch): Partial<typeof issues.$inferInsert> => {
  const set: Partial<typeof issues.$inferInsert> = { updatedAt: patch.updatedAt ?? new Date() };
  for (const key of PATCH_KEYS) {
    takeDefined(set, patch, key);
  }
  return set;
};

/**
 * Batched label lookup for a set of issue rows — no per-row queries (N+1
 * guard). Shared with jobs/rollover.job.ts, which loads full domain Issues
 * for the pure planner; labels come back id-sorted (deterministic).
 */
export const labelIdsFor = async (db: Db, ids: IssueId[]): Promise<Map<string, LabelId[]>> => {
  const map = new Map<string, LabelId[]>();
  if (ids.length === 0) {
    return map;
  }
  const rows = await db
    .select({ issueId: issueLabels.issueId, labelId: issueLabels.labelId })
    .from(issueLabels)
    .where(inArray(issueLabels.issueId, ids))
    .orderBy(asc(issueLabels.issueId), asc(issueLabels.labelId));
  for (const row of rows) {
    const existing = map.get(row.issueId);
    if (existing === undefined) {
      map.set(row.issueId, [row.labelId]);
    } else {
      existing.push(row.labelId);
    }
  }
  return map;
};

export const createIssueRepo = (db: Db): IssueRepo => {
  const withLabels = async (row: IssueRow): Promise<Issue> => {
    const labels = await labelIdsFor(db, [row.id]);
    return toDomain(row, labels.get(row.id) ?? []);
  };

  const groupCounts = async (
    where: SQL | undefined,
    groupBy: DisplaySpec["groupBy"],
  ): Promise<{ key: string; count: number }[]> => {
    if (groupBy === "none") {
      const [row] = await db.select({ n: count() }).from(issues).where(where);
      return [{ key: "all", count: row?.n ?? 0 }];
    }
    if (groupBy === "label") {
      // per-label incidence counts — a doubly-labelled issue counts twice,
      // so the sum can exceed the filtered total (documented in the contract)
      const rows = await db
        .select({ key: issueLabels.labelId, n: count() })
        .from(issues)
        .innerJoin(issueLabels, eq(issueLabels.issueId, issues.id))
        .where(where)
        .groupBy(issueLabels.labelId);
      return sortGroupCounts(rows.map((r) => ({ key: r.key, count: r.n })));
    }
    const col =
      groupBy === "status"
        ? issues.stateId
        : groupBy === "assignee"
          ? issues.assigneeId
          : issues.priority;
    const keyExpr =
      groupBy === "assignee" ? sql<string>`coalesce(${col}, '__none__')` : sql<string>`${col}`;
    const rows = await db
      .select({ key: keyExpr, n: count() })
      .from(issues)
      .where(where)
      .groupBy(col);
    return sortGroupCounts(rows.map((r) => ({ key: r.key, count: r.n })));
  };

  const attemptCreate = (input: CreateIssueInput, order: OrderKey): Promise<Issue> =>
    db.transaction(async (tx) => {
      // ADR 0006: max(number)+1 read inside the create transaction; a lost
      // race hits the (teamId, number) unique index and is retried once.
      // Gaps are allowed and never backfilled.
      const [agg] = await tx
        .select({ maxNumber: max(issues.number) })
        .from(issues)
        .where(eq(issues.teamId, input.teamId));
      const number = (agg?.maxNumber ?? 0) + 1;
      const id = input.id ?? issueId(randomUUID());
      const now = new Date();
      const values = createValues(
        {
          teamId: input.teamId,
          title: input.title,
          description: input.description,
          stateId: input.stateId,
          priority: input.priority,
          estimate: input.estimate ?? null,
          assigneeId: input.assigneeId ?? null,
          creatorId: input.creatorId,
          parentId: input.parentId ?? null,
          projectId: input.projectId ?? null,
          milestoneId: input.milestoneId ?? null,
          cycleId: input.cycleId ?? null,
          createdAt: input.createdAt ?? now,
        },
        id,
        number,
        order,
      );
      await tx.insert(issues).values(values);
      const labelIds = input.labelIds ?? [];
      if (labelIds.length > 0) {
        await tx.insert(issueLabels).values(labelIds.map((labelId) => ({ issueId: id, labelId })));
      }
      return toDomain(values, labelIds);
    });

  const updateReturning = async (
    set: Partial<typeof issues.$inferInsert>,
    id: IssueId,
  ): Promise<Issue> => {
    const rows = await db.update(issues).set(set).where(eq(issues.id, id)).returning();
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundError(`issue ${id} not found`);
    }
    return withLabels(row);
  };

  return {
    byId: async (id) => {
      const rows = await db.select().from(issues).where(eq(issues.id, id)).limit(1);
      const row = rows[0];
      return row === undefined ? null : withLabels(row);
    },

    list: async (query) => {
      const { filter, display, cursor, limit } = query;
      assertLimit(limit);
      const filterCond = filterToConditions(filter);
      const sort = sortFor(display.sortBy);
      const dir = display.direction === "asc" ? asc : desc;
      const where = pageWhere(filterCond, sort, display.direction, cursor);

      const rows = await db
        .select()
        .from(issues)
        .where(where)
        .orderBy(dir(sort.expr), dir(issues.id))
        .limit(limit + 1);

      const page = rows.slice(0, limit);
      const labels = await labelIdsFor(
        db,
        page.map((r) => r.id),
      );
      const items = page.map((row) => toDomain(row, labels.get(row.id) ?? []));

      const last = page[page.length - 1];
      const nextCursor =
        rows.length > limit && last !== undefined
          ? serializeCursor({ sk: sort.cursorValue(last), id: last.id })
          : null;

      // group counts are computed over the whole filtered set — cursor and
      // limit do not skew them
      const counts = await groupCounts(filterCond, display.groupBy);
      return { items, nextCursor, groupCounts: counts };
    },

    create: async (input, order) => {
      try {
        return await attemptCreate(input, order);
      } catch (err) {
        if (!isUniqueViolation(err)) {
          throw err;
        }
        // ADR 0006: retry the whole allocation+insert ONCE, then conflict.
        try {
          return await attemptCreate(input, order);
        } catch (retryErr) {
          if (isUniqueViolation(retryErr)) {
            throw new ConflictError(
              `issue number allocation collided twice for team ${input.teamId}`,
            );
          }
          throw retryErr;
        }
      }
    },

    update: async (id, patch) => updateReturning(patchToSet(patch), id),

    move: async (id, order, toStateId) => {
      // validates the key is a finite number serialization
      orderKeyNumber(order);
      const set: Partial<typeof issues.$inferInsert> = { order, updatedAt: new Date() };
      if (toStateId !== undefined) {
        set.stateId = toStateId;
      }
      return updateReturning(set, id);
    },

    setLabels: (id, labelIds) =>
      db.transaction(async (tx) => {
        const rows = await tx.select().from(issues).where(eq(issues.id, id)).limit(1);
        const row = rows[0];
        if (row === undefined) {
          throw new NotFoundError(`issue ${id} not found`);
        }
        const updatedAt = new Date();
        await tx.update(issues).set({ updatedAt }).where(eq(issues.id, id));
        await tx.delete(issueLabels).where(eq(issueLabels.issueId, id));
        if (labelIds.length > 0) {
          await tx
            .insert(issueLabels)
            .values(labelIds.map((labelId) => ({ issueId: id, labelId })));
        }
        return toDomain({ ...row, updatedAt }, labelIds);
      }),

    archive: (id, at) => {
      const set: Partial<typeof issues.$inferInsert> = { archivedAt: at, updatedAt: new Date() };
      return updateReturning(set, id);
    },

    relations: async (id) =>
      db
        .select()
        .from(issueRelations)
        .where(eq(issueRelations.issueId, id))
        .orderBy(asc(issueRelations.type), asc(issueRelations.relatedIssueId)),

    nextNumber: async (teamId) => {
      const [agg] = await db
        .select({ maxNumber: max(issues.number) })
        .from(issues)
        .where(eq(issues.teamId, teamId));
      return (agg?.maxNumber ?? 0) + 1;
    },
  };
};
