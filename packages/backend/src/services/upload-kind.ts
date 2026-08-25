import path from "node:path";

export type SupportedUploadKind = "pdf" | "pptx";

export function inferUploadKind(fileName: string, contentType?: string | null): SupportedUploadKind | null {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".pdf") return "pdf";
  if (extension === ".pptx") return "pptx";
  const normalized = (contentType ?? "").toLowerCase();
  if (normalized.includes("application/pdf")) return "pdf";
  if (normalized.includes("application/vnd.openxmlformats-officedocument.presentationml.presentation")) return "pptx";
  return null;
}
