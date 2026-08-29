import type { ExportFormat, ExportJob, ExportOptions } from "@bg/shared";
import { apiFetch } from "./client";

export type { ExportFormat, ExportJob, ExportOptions };

/**
 * User-facing label per export format, used by ExportStatusList and
 * the error toast in ExportMenu so the user never sees the raw enum
 * value (`html_zip`, etc).
 */
export function formatLabel(format: ExportFormat): string {
  switch (format) {
    case "pdf":
      return "PDF";
    case "png":
      return "PNG";
    case "pptx":
      return "파워포인트";
    case "html_zip":
      return "HTML ZIP 파일";
    case "handoff":
      return "개발자 전달용";
  }
}

export async function createExport(
  projectId: string,
  format: ExportFormat,
  options?: ExportOptions,
): Promise<ExportJob> {
  return apiFetch<ExportJob>(`/api/projects/${projectId}/exports`, {
    method: "POST",
    body: JSON.stringify(options ? { format, options } : { format }),
  });
}

export async function listExports(projectId: string): Promise<ExportJob[]> {
  return apiFetch<ExportJob[]>(`/api/projects/${projectId}/exports`);
}

export async function getExport(id: string): Promise<ExportJob> {
  return apiFetch<ExportJob>(`/api/exports/${id}`);
}
