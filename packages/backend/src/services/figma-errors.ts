export class FigmaApiError extends Error {
  readonly name = "FigmaApiError";
  constructor(
    readonly code:
      | "missing_token"
      | "invalid_url"
      | "auth_failed"
      | "not_found"
      | "rate_limited"
      | "fetch_failed",
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
  }
}
