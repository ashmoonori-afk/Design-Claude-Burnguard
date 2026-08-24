import { parseArtifactDiff, parseArtifactReplay, parseArtifactRetention, parseArtifactSnapshot } from "./artifact-receipts";

const HASH = /^[0-9a-f]{64}$/;
const STATUSES = ["pending", "working", "committed", "cancelled", "failed", "conflicted", "recovering", "recovered"] as const;
export type PersistedArtifactStatus = (typeof STATUSES)[number];
export class PersistedArtifactOperationError extends Error {
  readonly name = "PersistedArtifactOperationError";
  readonly code = "corrupt_artifact_operation" as const;
}

export type PersistedArtifactOperationRow = {
  readonly id: unknown; readonly project_id: unknown; readonly status: unknown;
  readonly base_revision: unknown; readonly base_digest: unknown;
  readonly result_revision: unknown; readonly result_digest: unknown;
  readonly expected_revision: unknown; readonly expected_file_hash: unknown; readonly node_fingerprint: unknown;
  readonly diff_json: unknown; readonly snapshot_json: unknown; readonly retention_json: unknown; readonly replay_json: unknown;
  readonly created_at: unknown; readonly updated_at: unknown;
};

export function parsePersistedArtifactOperation(row: PersistedArtifactOperationRow): ReturnType<typeof parsePersistedArtifactOperationUnchecked> {
  try { return parsePersistedArtifactOperationUnchecked(row); }
  catch (error) {
    if (error instanceof PersistedArtifactOperationError) throw error;
    throw new PersistedArtifactOperationError(error instanceof Error ? error.message : "Persisted operation is corrupt");
  }
}

function parsePersistedArtifactOperationUnchecked(row: PersistedArtifactOperationRow) {
  const id = text(row.id); const projectId = text(row.project_id);
  const status = row.status;
  if (!STATUSES.includes(status as PersistedArtifactStatus)) corrupt("Unknown operation status");
  const baseRevision = count(row.base_revision); const expectedRevision = count(row.expected_revision);
  const baseDigest = hash(row.base_digest); const resultRevision = nullableCount(row.result_revision); const resultDigest = nullableHash(row.result_digest);
  const createdAt = count(row.created_at); const updatedAt = count(row.updated_at);
  if (expectedRevision !== baseRevision || updatedAt < createdAt) corrupt("Operation authority or timestamps are inconsistent");
  if (typeof row.expected_file_hash !== "string" || (row.expected_file_hash !== "" && !HASH.test(row.expected_file_hash))) corrupt("Expected file hash is invalid");
  if (typeof row.node_fingerprint !== "string" || (row.node_fingerprint !== "" && !HASH.test(row.node_fingerprint))) corrupt("Node fingerprint is invalid");
  const diff = parseArtifactDiff(json(row.diff_json));
  const snapshot = parseArtifactSnapshot(json(row.snapshot_json));
  const retention = parseArtifactRetention(json(row.retention_json));
  const replay = parseArtifactReplay(json(row.replay_json));
  const hasResult = resultRevision !== null && resultDigest !== null;
  if ((resultRevision === null) !== (resultDigest === null)) corrupt("Partial result identity is invalid");
  if (replay.kind === "patch" ? row.expected_file_hash === "" || row.node_fingerprint === "" : row.expected_file_hash !== "" || row.node_fingerprint !== "") corrupt("Expected patch anchors are inconsistent");
  switch (status as PersistedArtifactStatus) {
    case "committed":
      if (!hasResult || resultRevision !== baseRevision + 1 || replay.publication !== "result" || diff.length === 0) corrupt("Committed operation is inconsistent");
      break;
    case "cancelled":
      if (!hasResult || resultRevision !== baseRevision || resultDigest !== baseDigest || replay.publication !== "base" || diff.length !== 0) corrupt("Cancelled operation is inconsistent");
      break;
    case "pending":
      if (hasResult || replay.publication !== "base" || diff.length !== 0) corrupt("Pending operation is inconsistent");
      break;
    case "working": case "recovering":
      if (hasResult ? resultRevision !== baseRevision + 1 || replay.publication !== "result" || diff.length === 0 : replay.publication !== "base" || diff.length !== 0) corrupt("Recovering operation is inconsistent");
      break;
    case "failed": case "conflicted": case "recovered":
      if (hasResult || replay.publication !== "base") corrupt("Terminal operation is inconsistent");
      break;
  }
  return { id, project_id: projectId, status: status as PersistedArtifactStatus, base_revision: baseRevision, base_digest: baseDigest, result_revision: resultRevision, result_digest: resultDigest, expected_revision: expectedRevision, expected_file_hash: row.expected_file_hash, node_fingerprint: row.node_fingerprint, diff, snapshot, retention, replay, created_at: createdAt, updated_at: updatedAt };
}

function json(value: unknown): string { if (typeof value !== "string") corrupt("Operation JSON column is invalid"); return value; }
function text(value: unknown): string { if (typeof value !== "string" || value.length === 0) corrupt("Operation identifier is invalid"); return value; }
function hash(value: unknown): string { if (typeof value !== "string" || !HASH.test(value)) corrupt("Operation digest is invalid"); return value; }
function nullableHash(value: unknown): string | null { return value === null ? null : hash(value); }
function count(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) corrupt("Operation number is invalid"); return value; }
function nullableCount(value: unknown): number | null { return value === null ? null : count(value); }
function corrupt(message: string): never { throw new PersistedArtifactOperationError(message); }
