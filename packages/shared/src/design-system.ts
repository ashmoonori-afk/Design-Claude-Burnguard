import type { ExtractionDomain } from "./extraction-domain";
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

export interface DesignSystemExtractionLineageRequest {
  operation: "override" | "re-extraction";
  parent_receipt_id: string;
  parent_content_digest: string;
  reason: string;
  metadata: Readonly<Record<string, string>>;
}

export interface CreateDesignSystemExtractionRequest {
  source_url: string;
  source_type?: Extract<DesignSystemSourceType, "github" | "website" | "figma">;
  name?: string;
  system_id?: string;
  lineage?: DesignSystemExtractionLineageRequest;
}

export interface CreateDesignSystemUploadRequest {
  name?: string;
  system_id?: string;
}

export interface DesignSystemColorToken {
  name: string;
  value: string;
}

export interface DesignSystemTokensResponse {
  colors: DesignSystemColorToken[];
  token_file_path: string | null;
}

export interface UpsertDesignSystemColorRequest {
  name: string;
  value: string;
}

export interface DesignSystemFontUploadResponse {
  file_name: string;
  family: string;
  role: "display" | "sans" | "serif" | "mono" | null;
  rel_path: string;
}

export interface DesignSystemProvenanceEntry {
  readonly domain: ExtractionDomain;
  readonly key: string;
  readonly state: "observed" | "inferred" | "defaulted" | "unknown" | "conflicted";
  readonly confidence: number;
  readonly source_locators: readonly string[];
  readonly candidates: readonly { readonly value: string; readonly source_locator: string; readonly confidence: number }[];
  readonly conflicts: readonly string[];
  readonly unknown_reason: string | null;
  readonly lineage: readonly string[];
}

export interface DesignSystemProvenanceDocument {
  readonly schema_version: 1;
  readonly digest_algorithm: "sha256";
  readonly content_digest: string;
  readonly content: { readonly entries: readonly DesignSystemProvenanceEntry[] };
  readonly generated_at: number;
  readonly lineage: DesignSystemExtractionLineageRequest | null;
}

export interface DesignSystemExtractionSummary {
  inferred_source_type: Extract<
    DesignSystemSourceType,
    "github" | "website" | "figma" | "upload"
  >;
  brand_name: string;
  generated_files: string[];
  copied_logo_count: number;
  detected_css_var_count: number;
  detected_font_family_count: number;
  notes: string[];
  provenance: DesignSystemProvenanceDocument;
}

export interface CreateDesignSystemExtractionResponse {
  system: DesignSystemDetail;
  extraction: DesignSystemExtractionSummary;
}

export type CreateDesignSystemUploadResponse =
  CreateDesignSystemExtractionResponse;

/**
 * PATCH /api/design-systems/:id — partial update. All fields optional,
 * but at least one must be supplied; sending `description: null`
 * clears the description text.
 */
export interface UpdateDesignSystemRequest {
  name?: string;
  description?: string | null;
  status?: DesignSystemDetail["status"];
}

/**
 * DELETE /api/design-systems/:id — returns the deleted id on success.
 * Refusal cases (template row, referenced by active projects) surface
 * as 409 API errors instead, with `project_refs` in the error details
 * so the UI can list the blockers.
 */
export interface DeleteDesignSystemResponse {
  id: string;
  deleted: true;
}

export interface DeleteDesignSystemBlockedDetail {
  reason: "is_template" | "has_active_projects";
  project_refs?: Array<{ id: string; name: string }>;
}
