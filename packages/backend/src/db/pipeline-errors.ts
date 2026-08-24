export type PipelineErrorCode =
  | "artifact_identity_mismatch"
  | "content_receipt_mismatch"
  | "corrupt_json"
  | "corrupt_tag"
  | "expected_revision_conflict"
  | "invalid_options"
  | "invalid_transition"
  | "not_found";

export class PipelineRepositoryError extends Error {
  readonly name = "PipelineRepositoryError";
  constructor(readonly code: PipelineErrorCode, readonly entityId: string) { super(`${code}: ${entityId}`); }
}

export function parseJsonRecord(value: string, entityId: string): Readonly<Record<string, unknown>> {
  const parsed = parseJson(value, entityId);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new PipelineRepositoryError("corrupt_json", entityId);
  return Object.fromEntries(Object.entries(parsed));
}

export function parseJsonArray(value: string, entityId: string): readonly unknown[] {
  const parsed = parseJson(value, entityId);
  if (!Array.isArray(parsed)) throw new PipelineRepositoryError("corrupt_json", entityId);
  return parsed;
}

function parseJson(value: string, entityId: string): unknown {
  try { return JSON.parse(value); }
  catch (error) {
    if (error instanceof SyntaxError) throw new PipelineRepositoryError("corrupt_json", entityId);
    throw error;
  }
}
