import type {
  CreateDesignSystemExtractionRequest,
  CreateDesignSystemExtractionResponse,
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
