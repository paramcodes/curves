import type { DomainError, DomainErrorCode } from "@curves/domain/core/errors";
import { type TRPC_ERROR_CODE_KEY, TRPCError } from "@trpc/server";

/**
 * THE single DomainError → TRPCError mapping site. Domain and repo code throw
 * DomainError subclasses; routers never construct TRPCError themselves — this
 * table (consumed by the error middleware in trpc.ts) is the only translation
 * layer. The contract is documented in packages/api/ERRORS.md.
 */
const TRPC_CODE_BY_DOMAIN_CODE: Record<DomainErrorCode, TRPC_ERROR_CODE_KEY> = {
  not_found: "NOT_FOUND",
  invalid: "BAD_REQUEST",
  transition_not_allowed: "BAD_REQUEST",
  duplicate: "CONFLICT",
  conflict: "CONFLICT",
};

/**
 * Translate a DomainError into a TRPCError with the stable code from the
 * table above. The original error rides along as `cause` so server-side logs
 * keep the full stack. Anything that is not a DomainError is NOT handled
 * here — the middleware rethrows it untouched (tRPC maps it to
 * INTERNAL_SERVER_ERROR).
 */
export const mapDomainError = (error: DomainError): TRPCError =>
  new TRPCError({
    code: TRPC_CODE_BY_DOMAIN_CODE[error.code],
    message: error.message,
    cause: error,
  });
