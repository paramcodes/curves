import { ValidationError } from "@curves/domain/core/errors";
import type { DisplaySpec } from "@curves/domain/filters/display.types";
import type { FilterSpec } from "@curves/domain/filters/filter.types";

/**
 * Shared list shape — one procedure, every entity (CORE_MODEL §5).
 */
export interface ListQuery {
  filter: FilterSpec;
  display: DisplaySpec;
  cursor: string | null;
  limit: number;
}

export interface GroupCount {
  key: string;
  count: number;
}

export interface ListResult<T> {
  items: T[];
  nextCursor: string | null;
  groupCounts: GroupCount[];
}

/**
 * Keyset cursor payload: the sort value of the last row of the previous page
 * plus its id (tiebreaker). `sk` is the serialized sort value — epoch ms for
 * created/updated, the raw number for priority/order, the string for title.
 */
export interface CursorPayload {
  sk: string | number;
  id: string;
}

/** base64url(JSON) — opaque to callers, stable across pages. */
export const serializeCursor = ({ sk, id }: CursorPayload): string =>
  Buffer.from(JSON.stringify({ sk, id }), "utf8").toString("base64url");

/**
 * Inverse of serializeCursor. Throws ValidationError on any garbage — bad
 * base64url, bad JSON, wrong shape, wrong primitive types — so a corrupted
 * cursor surfaces as 400, never as a silent full rescan or a crash.
 */
export const parseCursor = (cursor: string): CursorPayload => {
  let json: string;
  try {
    json = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new ValidationError("malformed cursor: not base64url");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new ValidationError("malformed cursor: not JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new ValidationError("malformed cursor: expected object");
  }
  const { sk, id } = parsed as Record<string, unknown>;
  const skOk = typeof sk === "string" || typeof sk === "number";
  if (!skOk || typeof id !== "string") {
    throw new ValidationError("malformed cursor: expected { sk: string | number; id: string }");
  }
  return { sk, id };
};
