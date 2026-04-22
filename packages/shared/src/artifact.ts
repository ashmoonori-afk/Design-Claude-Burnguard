import type { FileInfo } from "./harness";

export interface ArtifactSummary {
  project_id: string;
  entrypoint: string;
  entrypoint_url: string;
  design_system_id: string | null;
  design_system_url: string | null;
  file_count: number;
  updated_at: number;
}

export interface FileTreeResponse {
  project_id: string;
  files: FileInfo[];
}

