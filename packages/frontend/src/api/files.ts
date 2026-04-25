import type { PatchFileRequest, PatchFileResponse } from "@bg/shared";
import { apiFetch } from "./client";

export interface FileUndoInfo {
  can_undo: boolean;
  stored_at: number | null;
}

export interface UndoFileResponse {
  rel_path: string;
  updated_at: number;
}

function encodePath(relPath: string): string {
  return relPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export async function patchProjectFile(
  projectId: string,
  relPath: string,
  patch: PatchFileRequest,
): Promise<PatchFileResponse> {
  return apiFetch<PatchFileResponse>(
    `/api/projects/${projectId}/fs/${encodePath(relPath)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
}

export async function getFileUndoInfo(
  projectId: string,
  relPath: string,
): Promise<FileUndoInfo> {
  return apiFetch<FileUndoInfo>(
    `/api/projects/${projectId}/fs/${encodePath(relPath)}/undo-info`,
  );
}

export async function undoLastFilePatch(
  projectId: string,
  relPath: string,
): Promise<UndoFileResponse> {
  return apiFetch<UndoFileResponse>(
    `/api/projects/${projectId}/fs/${encodePath(relPath)}/undo`,
    { method: "POST" },
  );
}
