import type {
  Comment,
  CreateCommentRequest,
  UpdateCommentRequest,
} from "@bg/shared";
import { apiFetch } from "./client";

export async function listProjectComments(projectId: string): Promise<Comment[]> {
  return apiFetch<Comment[]>(`/api/projects/${projectId}/comments`);
}

export async function createProjectComment(
  projectId: string,
  input: CreateCommentRequest,
): Promise<Comment> {
  return apiFetch<Comment>(`/api/projects/${projectId}/comments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateProjectComment(
  projectId: string,
  commentId: string,
  patch: UpdateCommentRequest,
): Promise<Comment> {
  return apiFetch<Comment>(
    `/api/projects/${projectId}/comments/${commentId}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
}
