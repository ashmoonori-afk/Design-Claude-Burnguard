import { readFile } from "node:fs/promises";
import { AcquisitionLimitError, DEFAULT_ACQUISITION_LIMITS, MAX_PARSED_ITEMS, throwIfAcquisitionAborted, type AcquisitionLimits } from "./extraction-acquisition";
import { DesignSystemExtractError } from "./extraction-errors";
import { inferUploadKind, type SupportedUploadKind } from "./upload-kind";

export { inferUploadKind };

const MAX_UPLOAD_UI_KIT_PAGES = 8;

export type { SupportedUploadKind } from "./upload-kind";
export type UploadManifestPage = {
  readonly index: number;
  readonly title: string;
  readonly summary: string;
  readonly text_excerpt: string;
};
export type UploadManifest = {
  readonly kind: SupportedUploadKind;
  readonly brand_name?: string;
  readonly page_count: number;
  readonly fonts: string[];
  readonly colors: string[];
  readonly font_sizes: string[];
  readonly font_weights: string[];
  readonly spacing_values: string[];
  readonly radii: string[];
  readonly shadows: string[];
  readonly notes: string[];
  readonly headings: string[];
  readonly bodies: string[];
  readonly misc_lines: string[];
  readonly pages: UploadManifestPage[];
};

export class ExtractionUploadManifestError extends Error {
  readonly name = "ExtractionUploadManifestError";
  constructor(readonly code: "manifest_missing" | "manifest_invalid_json" | "manifest_invalid_shape") {
    super(code);
  }
}

export function assertUploadSize(file: File, limits: AcquisitionLimits = DEFAULT_ACQUISITION_LIMITS): void {
  if (file.size > limits.uploadBytes) {
    throw new DesignSystemExtractError("invalid_upload", `Upload exceeds ${limits.uploadBytes} bytes`);
  }
}

export async function readBoundedUpload(
  file: File,
  signal: AbortSignal,
  limits: AcquisitionLimits = DEFAULT_ACQUISITION_LIMITS,
): Promise<Buffer> {
  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      throwIfAcquisitionAborted(signal);
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > limits.uploadBytes) throw new AcquisitionLimitError("upload_bytes", limits.uploadBytes, bytes);
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export async function readUploadManifest(manifestPath: string, signal?: AbortSignal): Promise<UploadManifest> {
  throwIfAcquisitionAborted(signal);
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch {
    if (signal?.aborted) throwIfAcquisitionAborted(signal);
    throw new ExtractionUploadManifestError("manifest_missing");
  }
  throwIfAcquisitionAborted(signal);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ExtractionUploadManifestError("manifest_invalid_json");
  }
  if (typeof parsed !== "object" || parsed === null || !("kind" in parsed) || (parsed.kind !== "pdf" && parsed.kind !== "pptx")) {
    throw new ExtractionUploadManifestError("manifest_invalid_shape");
  }
  throwIfAcquisitionAborted(signal);
  const brandName = field(parsed, "brand_name");
  const pageCount = field(parsed, "page_count");
  return {
    kind: parsed.kind,
    ...(typeof brandName === "string" ? { brand_name: brandName } : {}),
    page_count: typeof pageCount === "number" && Number.isFinite(pageCount) ? Math.max(0, Math.trunc(pageCount)) : 0,
    fonts: normalizeUploadStringList(field(parsed, "fonts"), 8, signal),
    colors: normalizeUploadStringList(field(parsed, "colors"), 24, signal),
    font_sizes: normalizeUploadStringList(field(parsed, "font_sizes"), 16, signal),
    font_weights: normalizeUploadStringList(field(parsed, "font_weights"), 12, signal),
    spacing_values: normalizeUploadStringList(field(parsed, "spacing_values"), 24, signal),
    radii: normalizeUploadStringList(field(parsed, "radii"), 12, signal),
    shadows: normalizeUploadStringList(field(parsed, "shadows"), 12, signal),
    notes: normalizeUploadStringList(field(parsed, "notes"), 16, signal),
    headings: normalizeUploadStringList(field(parsed, "headings"), 32, signal),
    bodies: normalizeUploadStringList(field(parsed, "bodies"), 32, signal),
    misc_lines: normalizeUploadStringList(field(parsed, "misc_lines"), 64, signal),
    pages: normalizeUploadPages(field(parsed, "pages"), signal),
  };
}

export function normalizeUploadStringList(value: unknown, limit: number, signal?: AbortSignal): string[] {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_PARSED_ITEMS) throw new AcquisitionLimitError("parsed_items", MAX_PARSED_ITEMS, value.length);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    throwIfAcquisitionAborted(signal);
    if (typeof entry !== "string") continue;
    const normalized = entry.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

export function normalizeUploadPages(value: unknown, signal?: AbortSignal): UploadManifestPage[] {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_PARSED_ITEMS) throw new AcquisitionLimitError("parsed_items", MAX_PARSED_ITEMS, value.length);
  const out: UploadManifestPage[] = [];
  for (const entry of value) {
    throwIfAcquisitionAborted(signal);
    if (typeof entry !== "object" || entry === null) continue;
    const index = field(entry, "index");
    out.push({
      index: typeof index === "number" && Number.isFinite(index) ? Math.max(1, Math.trunc(index)) : out.length + 1,
      title: stringField(entry, "title"),
      summary: stringField(entry, "summary"),
      text_excerpt: stringField(entry, "text_excerpt"),
    });
    if (out.length >= MAX_UPLOAD_UI_KIT_PAGES) break;
  }
  return out;
}

function field(input: object, key: string): unknown {
  return Reflect.get(input, key);
}

function stringField(input: object, key: string): string {
  const value = field(input, key);
  return typeof value === "string" ? value.trim() : "";
}
