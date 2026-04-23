import type { ApiErrorBody, ApiSuccess } from "@bg/shared";

export class ApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Thin typed wrapper over fetch that unwraps the shared API envelope and
 * throws a typed ApiError on either HTTP failure or `{error:...}` body.
 *
 * Used by the api/* modules. The seam where codex swaps stub implementations
 * for real calls.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (!(init?.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(path, {
    credentials: "same-origin",
    headers,
    ...init,
  });

  const body = (await res.json().catch(() => null)) as
    | ApiSuccess<T>
    | ApiErrorBody
    | null;

  if (!res.ok || !body || "error" in body) {
    const err =
      body && "error" in body
        ? body.error
        : { code: "network_error", message: res.statusText };
    throw new ApiError(err.code, err.message, res.status, (err as { details?: unknown }).details);
  }

  return (body as ApiSuccess<T>).data;
}
