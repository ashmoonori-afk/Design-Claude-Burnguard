import type { DesignSystemSummary } from "./home";

export type DesignSystemSourceType =
  | "sample"
  | "github"
  | "website"
  | "figma"
  | "upload"
  | "manual";

export interface DesignSystemDetail extends DesignSystemSummary {
  description: string | null;
  source_type: DesignSystemSourceType | null;
  source_uri: string | null;
  dir_path: string;
  skill_md_path: string | null;
  tokens_css_path: string | null;
  readme_md_path: string | null;
  archived_at: number | null;
}

export interface CreateDesignSystemExtractionRequest {
  source_url: string;
  source_type?: Extract<DesignSystemSourceType, "github" | "website">;
  name?: string;
  system_id?: string;
}

export interface CreateDesignSystemUploadRequest {
  name?: string;
  system_id?: string;
}

export interface DesignSystemExtractionSummary {
  inferred_source_type: Extract<
    DesignSystemSourceType,
    "github" | "website" | "upload"
  >;
  brand_name: string;
  generated_files: string[];
  copied_logo_count: number;
  detected_css_var_count: number;
  detected_font_family_count: number;
  notes: string[];
}

export interface CreateDesignSystemExtractionResponse {
  system: DesignSystemDetail;
  extraction: DesignSystemExtractionSummary;
}

export type CreateDesignSystemUploadResponse =
  CreateDesignSystemExtractionResponse;
