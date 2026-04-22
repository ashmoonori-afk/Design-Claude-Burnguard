import type { PatchFileRequest, PatchFileResponse } from "@bg/shared";
import { apiFetch } from "./client";

export async function patchProjectFile(
  projectId: string,
  relPath: string,
  patch: PatchFileRequest,
): Promise<PatchFileResponse> {
  const encoded = relPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return apiFetch<PatchFileResponse>(
    `/api/projects/${projectId}/fs/${encoded}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
}
