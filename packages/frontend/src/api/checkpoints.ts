import { apiFetch } from "./client";

export interface RestoreCheckpointResponse {
  turnId: string;
  restoredAt: number;
  removedEntries: string[];
  copiedEntries: string[];
}

export async function restoreCheckpoint(
  projectId: string,
  turnId: string,
): Promise<RestoreCheckpointResponse> {
  return apiFetch<RestoreCheckpointResponse>(
    `/api/projects/${projectId}/checkpoints/${encodeURIComponent(turnId)}/restore`,
    { method: "POST" },
  );
}
