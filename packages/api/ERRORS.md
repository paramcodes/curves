# API error-code contract

One error surface for every tRPC procedure. Two rules make it stable:

1. **Domain and repo code throw `DomainError` subclasses only**
   (`packages/domain/src/core/errors.ts`). They never import tRPC.
2. **Routers never construct `TRPCError`.** The single middleware in
   `src/trpc/trpc.ts` catches `DomainError` and maps it through the one table
   in `src/trpc/errors.ts`. The only `TRPCError`s constructed outside that
   table are the framework-internal ones: `UNAUTHORIZED` (the
   `protectedProcedure` guard) and tRPC's own request/zod errors
   (`BAD_REQUEST` on malformed input).

## The mapping table

| `DomainError.code` (thrown as)     | tRPC `code` (seen by clients) |
| ---------------------------------- | ----------------------------- |
| `not_found` (`NotFoundError`)      | `NOT_FOUND`                   |
| `invalid` (`ValidationError`)      | `BAD_REQUEST`                 |
| `transition_not_allowed` (`TransitionNotAllowedError`) | `BAD_REQUEST` |
| `duplicate` (`DuplicateError`)     | `CONFLICT`                    |
| `conflict` (`ConflictError`)       | `CONFLICT`                    |

Notes:

- The original `DomainError` is preserved as `cause` on the `TRPCError`
  (server-side stacks stay intact; it is not serialized to clients).
- Anything thrown that is **not** a `DomainError` passes through unmapped:
  `TRPCError`s keep their code, everything else becomes tRPC's
  `INTERNAL_SERVER_ERROR`. That is deliberate — an unmapped error is a bug,
  not a contract.
- Authorization failures (`assertCanAct` in `src/authz.ts`) deliberately throw
  `ValidationError` (→ `BAD_REQUEST`) rather than `FORBIDDEN`: the mapping
  table stays closed, and unauthenticated requests are already rejected with
  `UNAUTHORIZED` by `protectedProcedure` before any handler runs. Revisit only
  if a client needs to distinguish authz failures programmatically.

## Adding a new error code

1. Add the `DomainErrorCode` + subclass in `packages/domain/src/core/errors.ts`.
2. Extend the record in `src/trpc/errors.ts` — the compiler forces the new key
   into the table, so the mapping can never silently miss a code.
3. Append a row here.
