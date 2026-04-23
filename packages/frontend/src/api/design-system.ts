import type {
  CreateDesignSystemExtractionRequest,
  CreateDesignSystemExtractionResponse,
  CreateDesignSystemUploadRequest,
  CreateDesignSystemUploadResponse,
  DesignSystemDetail,
} from "@bg/shared";
import { apiFetch } from "./client";

export async function getDesignSystem(
  id: string,
): Promise<DesignSystemDetail> {
  return apiFetch<DesignSystemDetail>(`/api/design-systems/${id}`);
}

export async function extractDesignSystem(
  body: CreateDesignSystemExtractionRequest,
): Promise<CreateDesignSystemExtractionResponse> {
  return apiFetch<CreateDesignSystemExtractionResponse>(
    "/api/design-systems/extract",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export async function uploadDesignSystem(
  file: File,
  body?: CreateDesignSystemUploadRequest,
): Promise<CreateDesignSystemUploadResponse> {
  const form = new FormData();
  form.set("file", file);
  if (body?.name?.trim()) {
    form.set("name", body.name.trim());
  }
  if (body?.system_id?.trim()) {
    form.set("system_id", body.system_id.trim());
  }

  return apiFetch<CreateDesignSystemUploadResponse>(
    "/api/design-systems/upload",
    {
      method: "POST",
      body: form,
    },
  );
}
