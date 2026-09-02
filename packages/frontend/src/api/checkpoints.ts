import type { PatchFileResponse } from "@bg/shared";
import { apiFetch } from "./client";

export interface RestoreCheckpointResponse {
  operation_id: string;
  status: "committed" | "cancelled" | "conflicted";
  base_revision: number;
  base_digest: string;
  result_revision: number;
  result_digest: string;
  diff: PatchFileResponse["diff"];
}

export async function restoreCheckpoint(
  projectId: string,
  turnId: string,
  identity: {
    readonly expected_revision: number;
    readonly expected_artifact_digest: string;
  },
): Promise<RestoreCheckpointResponse> {
  return apiFetch<RestoreCheckpointResponse>(
    `/api/projects/${projectId}/checkpoints/${encodeURIComponent(turnId)}/restore`,
    { method: "POST", body: JSON.stringify(identity) },
  );
}
