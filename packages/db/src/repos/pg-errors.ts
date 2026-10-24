/** Postgres error codes repos translate into typed domain errors. */
export const PG_UNIQUE_VIOLATION = "23505";

/** Walk the cause chain (drizzle wraps driver errors) looking for the code. */
export const isUniqueViolation = (err: unknown): boolean => {
  let cause: unknown = err;
  for (let depth = 0; depth < 5 && typeof cause === "object" && cause !== null; depth++) {
    if ((cause as { code?: unknown }).code === PG_UNIQUE_VIOLATION) {
      return true;
    }
    cause = (cause as { cause?: unknown }).cause;
  }
  return false;
};
