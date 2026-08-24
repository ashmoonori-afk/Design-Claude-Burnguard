import type { Database } from "bun:sqlite";
import { parsePersistedArtifactOperation, type PersistedArtifactOperationRow } from "../services/artifact-operation-record";

export function listArtifactOperations(db: Database, projectId: string): readonly ReturnType<typeof apiOperation>[] {
  return db.query<PersistedArtifactOperationRow, [string]>(`${SELECT_OPERATION} WHERE project_id=? ORDER BY created_at DESC,id DESC`).all(projectId).map((row) => apiOperation(parsePersistedArtifactOperation(row)));
}

export function getArtifactOperation(db: Database, projectId: string, operationId: string): ReturnType<typeof apiOperation> | null {
  const row = db.query<PersistedArtifactOperationRow, [string, string]>(`${SELECT_OPERATION} WHERE project_id=? AND id=?`).get(projectId, operationId);
  return row === null ? null : apiOperation(parsePersistedArtifactOperation(row));
}

function apiOperation(operation: ReturnType<typeof parsePersistedArtifactOperation>) {
  return {
    id: operation.id, project_id: operation.project_id, status: operation.status,
    base_revision: operation.base_revision, base_digest: operation.base_digest,
    result_revision: operation.result_revision, result_digest: operation.result_digest,
    diff: operation.diff, snapshot: { base_manifest: operation.snapshot.base_manifest },
    retention: operation.retention, replay: operation.replay,
    created_at: operation.created_at, updated_at: operation.updated_at,
  };
}

export const SELECT_ARTIFACT_OPERATION = "SELECT id,project_id,status,base_revision,base_digest,result_revision,result_digest,expected_revision,expected_file_hash,node_fingerprint,diff_json,snapshot_json,retention_json,replay_json,created_at,updated_at FROM artifact_operations";
const SELECT_OPERATION = SELECT_ARTIFACT_OPERATION;
