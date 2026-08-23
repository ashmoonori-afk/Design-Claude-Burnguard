import { UpgradeContractError, decodeContract } from "./contract-parser";
export { UpgradeContractError };

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

export function parseExportOptions(input: unknown): ExportOptions {
  const record = decodeContract(input);
  for (const key of Object.keys(record)) {
    if (key !== "pdf_paper" && key !== "pptx_size") {
      throw new UpgradeContractError("invalid_field", key);
    }
  }
  const pdfPaper = record["pdf_paper"];
  const pptxSize = record["pptx_size"];
  if (pdfPaper !== undefined && pdfPaper !== "a4" && pdfPaper !== "letter" && pdfPaper !== "widescreen-16x9") {
    throw new UpgradeContractError("invalid_field", "pdf_paper");
  }
  if (pptxSize !== undefined && pptxSize !== "16x9" && pptxSize !== "4x3") {
    throw new UpgradeContractError("invalid_field", "pptx_size");
  }
  return {
    ...(pdfPaper === undefined ? {} : { pdf_paper: pdfPaper }),
    ...(pptxSize === undefined ? {} : { pptx_size: pptxSize }),
  };
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

