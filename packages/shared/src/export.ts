export type ExportFormat = "html_zip" | "pdf" | "pptx" | "handoff";
export type ExportStatus = "pending" | "running" | "succeeded" | "failed";

export type PdfPaper = "a4" | "letter" | "widescreen-16x9";
export type PptxSize = "16x9" | "4x3";

/**
 * Per-format render options for an export create request. Pass-through
 * only — not persisted on the job row — so a retry from the status list
 * falls back to defaults. The menu is what carries the preset choice.
 */
export interface ExportOptions {
  pdf_paper?: PdfPaper;
  pptx_size?: PptxSize;
}

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

