import type { ExportFormat, ExportJob } from "@bg/shared";
import { apiFetch } from "./client";

export type { ExportFormat, ExportJob };

export async function createExport(
  projectId: string,
  format: ExportFormat,
): Promise<ExportJob> {
  return apiFetch<ExportJob>(`/api/projects/${projectId}/exports`, {
    method: "POST",
    body: JSON.stringify({ format }),
  });
}

export async function listExports(projectId: string): Promise<ExportJob[]> {
  return apiFetch<ExportJob[]>(`/api/projects/${projectId}/exports`);
}

export async function getExport(id: string): Promise<ExportJob> {
  return apiFetch<ExportJob>(`/api/exports/${id}`);
}
