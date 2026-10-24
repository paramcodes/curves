export type DomainErrorCode =
  | "not_found"
  | "invalid"
  | "transition_not_allowed"
  | "duplicate"
  | "conflict";

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;
}

export class NotFoundError extends DomainError {
  readonly code = "not_found" as const;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends DomainError {
  readonly code = "invalid" as const;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class TransitionNotAllowedError extends DomainError {
  readonly code = "transition_not_allowed" as const;
  constructor(message: string) {
    super(message);
    this.name = "TransitionNotAllowedError";
  }
}

export class DuplicateError extends DomainError {
  readonly code = "duplicate" as const;
  constructor(message: string) {
    super(message);
    this.name = "DuplicateError";
  }
}

export class ConflictError extends DomainError {
  readonly code = "conflict" as const;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
