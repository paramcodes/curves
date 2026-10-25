import type { ListQuery, ListResult } from "@curves/db/repos/list";
import { displaySchema, filterSchema } from "@curves/domain/filters/filter.schema";
import { z } from "zod";
import type { CurvesContext, SafeUser } from "./trpc/context";
import { protectedProcedure } from "./trpc/trpc";

/**
 * THE shared list procedure shape (CORE_MODEL §6): one input schema, one
 * output shape, every listable resource. The filter/display specs are the
 * domain's zod schemas — the API invents no query semantics of its own.
 *
 * `list` receives the request context so each router hands it its own repo
 * factory (repos are cheap closures over ctx.db); the helper owns everything
 * else — auth gate, parsing, cursor/limit plumbing.
 */
const listInputSchema = z.object({
  filter: filterSchema,
  display: displaySchema,
  cursor: z.string().nullable(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const listProcedure = <TItem>(
  list: (ctx: CurvesContext & { user: SafeUser }, query: ListQuery) => Promise<ListResult<TItem>>,
) =>
  protectedProcedure.input(listInputSchema).query(({ ctx, input }) =>
    list(ctx, {
      filter: input.filter,
      display: input.display,
      cursor: input.cursor,
      limit: input.limit,
    }),
  );
