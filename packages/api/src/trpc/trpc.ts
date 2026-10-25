import { DomainError } from "@curves/domain/core/errors";
import { initTRPC, TRPCError } from "@trpc/server";
import type { z } from "zod";
import type { AuthSession, CurvesContext, SafeUser } from "./context";
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
 * Mutation-registry discipline: `mutation(...)` is the ONLY sanctioned shape
 * for a mutation procedure, and the registry test (src/routers/registry.test.ts)
 * enforces it three ways: it walks every assembled router and fails on any
 * mutation missing the tag, it cross-checks each router's exported `mutations`
 * list, and it scans the router SOURCES for a raw `.mutation(` builder call
 * that would bypass this helper (strike-2 hardening).
 *
 * `authorize` is REQUIRED and runs structurally BEFORE `resolve`, after the
 * input parses, inside the same procedure — so a mutation whose authorization
 * decision is implicit cannot be expressed, and DomainErrors the gate throws
 * map through the one table in errors.ts. Most gates are a single assertCanAct
 * call; mutations whose authz lives in a repo-level ownership guard
 * (notifications' per-user markRead) pass a function that documents that and
 * returns.
 *
 * `input` takes the zod schema — `z.void()` for input-less mutations. Keeping
 * the shape uniform (no optional-input branch) lets the helper be one
 * non-branching build whose inferred procedure type preserves input/output
 * types for every caller.
 */
export const MUTATION_TAG: unique symbol = Symbol("curves.mutation");

export interface TaggedMutation {
  readonly [MUTATION_TAG]: true;
}

/** The narrowed context mutation callbacks receive (requireUser has run). */
export type MutationCtx = CurvesContext & { user: SafeUser; session: AuthSession };

type ParsedInput<TIn extends z.ZodTypeAny> = z.output<TIn>;

export interface MutationConfig<TIn extends z.ZodTypeAny, TResult> {
  /** The zod input schema; `z.void()` for input-less mutations. */
  input: TIn;
  /**
   * THE authz gate — runs before resolve, after input parse. Must be an
   * explicit authorization decision (usually assertCanAct) or a documented
   * delegation to a repo-level ownership guard.
   */
  authorize: (ctx: MutationCtx, input: ParsedInput<TIn>) => Promise<void> | void;
  /** The resolver; `authorize` has already run when this is called. */
  resolve: (opts: { ctx: MutationCtx; input: ParsedInput<TIn> }) => Promise<TResult>;
}

export const mutation = <TIn extends z.ZodTypeAny, TResult>(
  config: MutationConfig<TIn, TResult>,
) => {
  const procedure = protectedProcedure.input(config.input).mutation(async ({ ctx, input }) => {
    const parsed = input as ParsedInput<TIn>;
    await config.authorize(ctx, parsed);
    return config.resolve({ ctx, input: parsed });
  });
  // tRPC builder procedures are objects; the non-enumerable tag survives
  // router assembly (the registry test reflects on it).
  return Object.defineProperty(procedure, MUTATION_TAG, {
    value: true,
    enumerable: false,
    writable: false,
  });
};
