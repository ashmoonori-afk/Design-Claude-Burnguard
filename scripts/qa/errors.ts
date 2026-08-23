export class QaInputError extends Error {
  readonly name = "QaInputError";

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class QaPreflightError extends Error {
  readonly name = "QaPreflightError";

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class QaTimeoutError extends Error {
  readonly name = "QaTimeoutError";

  constructor(readonly operation: string) {
    super(`Timed out while waiting for ${operation}`);
  }
}
