/**
 * Error classes for Multindex
 */

/**
 * Base error class for all Multindex errors
 */
export class MultindexError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MultindexError"
  }
}

/**
 * Error thrown when attempting to add an item with a key that already exists
 * in a unique index
 */
export class UniquenessViolationError extends MultindexError {
  constructor(
    public readonly key: unknown,
    message?: string,
  ) {
    super(message ?? `Uniqueness violation: key already exists in index`)
    this.name = "UniquenessViolationError"
  }
}

/**
 * Error thrown when attempting to get an item by a key that doesn't exist
 */
export class KeyNotFoundError extends MultindexError {
  constructor(
    public readonly key: unknown,
    message?: string,
  ) {
    super(message ?? `Key not found in index`)
    this.name = "KeyNotFoundError"
  }
}

/**
 * Error thrown when attempting to add to a subindex without required key setters
 */
export class KeySetterRequiredError extends MultindexError {
  constructor(message?: string) {
    super(message ?? `Key setter is required when adding to a subindex`)
    this.name = "KeySetterRequiredError"
  }
}

/**
 * Error thrown when attempting an operation that's not valid in the current context
 */
export class InvalidOperationError extends MultindexError {
  constructor(message: string) {
    super(message)
    this.name = "InvalidOperationError"
  }
}
