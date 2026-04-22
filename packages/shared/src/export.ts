export type ExportFormat = "html_zip" | "pdf" | "pptx" | "handoff";
export type ExportStatus = "pending" | "running" | "succeeded" | "failed";

export interface ExportJob {
  id: string;
  project_id: string;
  format: ExportFormat;
  status: ExportStatus;
  output_path: string | null;
  error_message: string | null;
  size_bytes: number | null;
  created_at: number;
  completed_at: number | null;
}

