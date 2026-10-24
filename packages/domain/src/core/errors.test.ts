import { describe, expect, it } from "vitest";
import {
  ConflictError,
  DomainError,
  DuplicateError,
  NotFoundError,
  TransitionNotAllowedError,
  ValidationError,
} from "./errors";

describe("domain errors", () => {
  it.each([
    [NotFoundError, "not_found"],
    [ValidationError, "invalid"],
    [TransitionNotAllowedError, "transition_not_allowed"],
    [DuplicateError, "duplicate"],
    [ConflictError, "conflict"],
  ])("%p carries its code and is a DomainError", (Err, code) => {
    const err = new (Err as new (m: string) => DomainError)("boom");
    expect(err.code).toBe(code);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.message).toBe("boom");
  });
});
