import type { FileInfo } from "@bg/shared";

export type ExistingVisualSource = {
  readonly source_type: "existing_project_file";
  readonly rel_path: string;
  readonly status: "editable";
  readonly sha256: string;
};

const VISUAL_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".pdf", ".pptx"] as const;

export function listExistingVisualSources(files: readonly FileInfo[]): readonly ExistingVisualSource[] {
  return files.flatMap((file) => {
    const relative = file.rel_path.replaceAll("\\", "/");
    const safe = relative.length > 0 && !relative.startsWith("/") && relative.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
    const hash = file.hash;
    if (!safe || typeof hash !== "string" || !/^[a-f0-9]{64}$/u.test(hash) || !VISUAL_EXTENSIONS.some((extension) => relative.toLowerCase().endsWith(extension))) return [];
    return [{ source_type: "existing_project_file" as const, rel_path: relative, status: "editable" as const, sha256: hash }];
  });
}
