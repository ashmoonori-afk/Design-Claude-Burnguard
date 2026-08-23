import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export const CANONICAL_EXTRACTION_FILES = [
  "README.md",
  "SKILL.md",
  "colors_and_type.css",
  "fonts/fonts.css",
  "extraction-provenance.json",
] as const;

export type ValidatedExtractionSidecar = {
  readonly content_digest: string;
  readonly content: { readonly entries: readonly unknown[] };
};

export class ExtractionSidecarError extends Error {
  readonly name = "ExtractionSidecarError";
}

export async function readValidatedExtractionSidecar(root: string): Promise<ValidatedExtractionSidecar> {
  for (const relativePath of CANONICAL_EXTRACTION_FILES) {
    if (!(await isFile(path.join(root, relativePath)))) throw new ExtractionSidecarError(`Missing canonical extraction file: ${relativePath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path.join(root, "extraction-provenance.json"), "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new ExtractionSidecarError("Extraction provenance is not JSON");
    throw error;
  }
  if (!isRecord(parsed) || parsed.schema_version !== 1 || parsed.digest_algorithm !== "sha256" || typeof parsed.content_digest !== "string" || !isRecord(parsed.content) || !Array.isArray(parsed.content.entries) || typeof parsed.generated_at !== "number") {
    throw new ExtractionSidecarError("Extraction provenance has an invalid shape");
  }
  const content = { entries: parsed.content.entries };
  const actualDigest = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  if (parsed.content_digest !== actualDigest) throw new ExtractionSidecarError("Extraction provenance digest mismatch");
  return { content_digest: parsed.content_digest, content };
}

async function isFile(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isFile();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
