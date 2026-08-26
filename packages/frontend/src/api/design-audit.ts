import { parseDesignAuditResult, type DesignAuditResult } from "@bg/shared";
import { apiFetch } from "./client";

export async function getProjectDesignAudit(projectId: string): Promise<DesignAuditResult> {
  return parseDesignAuditResult(await apiFetch<unknown>(`/api/projects/${projectId}/design-audit`));
}

export async function retryProjectDesignAudit(projectId: string): Promise<DesignAuditResult> {
  return parseDesignAuditResult(await apiFetch<unknown>(`/api/projects/${projectId}/design-audit/retry`, { method: "POST" }));
}
