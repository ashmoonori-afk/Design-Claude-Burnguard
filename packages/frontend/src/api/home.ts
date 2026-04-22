import type {
  BackendDetectionResult,
  CreateProjectRequest,
  CreateProjectResponse,
  DesignSystemSummary,
  ProjectSummary,
  SettingsPatch,
  SettingsSummary,
} from "@bg/shared";
import { apiFetch } from "./client";

export async function listProjects(
  tab: "recent" | "mine" | "examples" = "recent",
): Promise<ProjectSummary[]> {
  return apiFetch<ProjectSummary[]>(`/api/projects?tab=${tab}`);
}

export async function listDesignSystems(
  status: "published" | "review" | "draft" = "published",
): Promise<DesignSystemSummary[]> {
  return apiFetch<DesignSystemSummary[]>(`/api/design-systems?status=${status}`);
}

export async function createProject(
  body: CreateProjectRequest,
): Promise<CreateProjectResponse> {
  return apiFetch<CreateProjectResponse>("/api/projects", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function detectBackends(): Promise<BackendDetectionResult> {
  return apiFetch<BackendDetectionResult>("/api/backends/detect");
}

export async function getSettings(): Promise<SettingsSummary> {
  return apiFetch<SettingsSummary>("/api/settings");
}

export async function patchSettings(
  patch: SettingsPatch,
): Promise<SettingsSummary> {
  return apiFetch<SettingsSummary>("/api/settings", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete project ${id}: HTTP ${res.status}`);
  }
}
