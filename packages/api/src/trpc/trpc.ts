import { DomainError } from "@curves/domain/core/errors";
import { type AnyMutationProcedure, initTRPC, TRPCError } from "@trpc/server";
import type { CurvesContext } from "./context";
import { mapDomainError } from "./errors";

const t = initTRPC.context<CurvesContext>().create();

/**
 * THE error boundary. Every procedure (public and protected) runs inside it:
 * DomainErrors are translated by the one mapping table (errors.ts), and
 * everything else is rethrown untouched — tRPC maps non-TRPCErrors to
 * INTERNAL_SERVER_ERROR, which keeps "unmapped error = bug" true.
 *
 * v11 semantics (verified against the installed @trpc/server 11.19.0): a
 * throwing resolver does NOT reject `next()` — it resolves with
 * `{ ok: false, error }`, and tRPC has already wrapped the raw throw as that
 * TRPCError's `cause`. So the DomainError arrives as `result.error.cause` and
 * is rethrown as a freshly mapped TRPCError (tRPC preserves TRPCErrors thrown
 * by middleware). The catch path covers anything that skips the result
 * machinery (e.g. aborts).
 */
const mapErrors = t.middleware(async ({ next }) => {
  try {
    const result = await next();
    if (!result.ok) {
      const cause: unknown = result.error.cause;
      if (cause instanceof DomainError) throw mapDomainError(cause);
    }
    return result;
  } catch (cause) {
    if (cause instanceof DomainError) throw mapDomainError(cause);
    throw cause;
  }
});

const requireUser = t.middleware(({ ctx, next }) => {
  if (!ctx.user || !ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in to access this procedure" });
  }
  // Narrow the context for downstream resolvers: user/session are non-null.
  return next({ ctx: { user: ctx.user, session: ctx.session } });
});

/** Open procedures: anonymous callers allowed; DomainErrors still map. */
export const publicProcedure = t.procedure.use(mapErrors);

/** Auth-gated procedures: anonymous callers get UNAUTHORIZED. */
export const protectedProcedure = publicProcedure.use(requireUser);

export const router = t.router;

/** Caller factory for server-side invocation (boot check, tests). */
export const createCallerFactory = t.createCallerFactory;

/**
 * Mutation-registry discipline: `mutation(...)` is the ONLY sanctioned way to
 * build a mutation procedure. It tags the built procedure with a symbol, and
 * the registry test (src/routers/registry.test.ts) walks every assembled
 * router and fails on any mutation the tag is missing from — so a raw
 * `.mutation()` call that bypasses the helper cannot ship. Routers must also
 * list their mutation keys in an exported `mutations` array; the registry
 * test cross-checks both directions.
 */
export const MUTATION_TAG: unique symbol = Symbol("curves.mutation");

export interface TaggedMutation {
  readonly [MUTATION_TAG]: true;
}

export const mutation = <TProcedure extends AnyMutationProcedure>(
  procedure: TProcedure,
): TProcedure & TaggedMutation => {
  if (MUTATION_TAG in procedure) return procedure as TProcedure & TaggedMutation;
  Object.defineProperty(procedure, MUTATION_TAG, {
    value: true,
    enumerable: false,
    writable: false,
  });
  return procedure as TProcedure & TaggedMutation;
};
