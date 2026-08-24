import type { ExportFormat, ExportOptions } from "@bg/shared";
import { pdfPointsForPaper, pdfPointsMatchPaper, pdfRasterBudgetFits, PDF_MAX_PAGE_PIXELS } from "./export-pdf-contract";
import { validatePdfReceiptObservation } from "./export-pdf-receipt-invariants";
import type { PdfValidation } from "./export-pdf-validation";
import type { PngValidation } from "./export-png-validation";

export type ExportValidation =
  | { readonly entries: number }
  | PdfValidation
  | PngValidation
  | { readonly slides: number; readonly editable_text_nodes: number }
  | { readonly source_files: number; readonly nodes: number };

const MAX_PAGES = 100; const MAX_POINTS = 2_000; const MAX_PNG_PIXELS = 16_000_000; const MAX_OPERATORS = 1_000_000;

export function parseExportValidation(format: ExportFormat, options: ExportOptions, input: unknown): ExportValidation {
  if (!record(input)) fail();
  switch (format) {
    case "html_zip": exact(input, ["entries"]); return { entries: positiveInt(input["entries"]) };
    case "png": return parsePng(input, options);
    case "pptx": exact(input, ["slides", "editable_text_nodes"]); return { slides: positiveInt(input["slides"]), editable_text_nodes: positiveInt(input["editable_text_nodes"]) };
    case "handoff": exact(input, ["source_files", "nodes"]); return { source_files: positiveInt(input["source_files"]), nodes: nonnegativeInt(input["nodes"]) };
    case "pdf": return parsePdf(input, options);
  }
}
function parsePng(input: Readonly<Record<string, unknown>>, options: ExportOptions): PngValidation {
  exact(input, ["width", "height", "statistics"]); const width = positiveInt(input["width"]); const height = positiveInt(input["height"]); if (width * height > MAX_PNG_PIXELS || options.png_width === undefined || options.png_height === undefined || options.png_dpr === undefined || width !== options.png_width * options.png_dpr || height !== options.png_height * options.png_dpr) fail();
  const statistics = pngStatistics(input["statistics"], width * height); return { width, height, statistics };
}
function parsePdf(input: Readonly<Record<string, unknown>>, options: ExportOptions): PdfValidation {
  exact(input, ["pages", "title", "observations"]); const pages = boundedPositive(input["pages"], MAX_PAGES); const title = text(input["title"]); const raw = input["observations"]; const paper = options.pdf_paper; if (!Array.isArray(raw) || raw.length !== pages || paper === undefined) fail(); const expected = pdfPointsForPaper(paper); if (!pdfRasterBudgetFits(expected.width, expected.height, pages)) fail();
  const observations = raw.map((item, index) => pdfObservation(item, index + 1, paper)); return { pages, title, observations };
}
function pdfObservation(input: unknown, expectedPage: number, paper: NonNullable<ExportOptions["pdf_paper"]>): PdfValidation["observations"][number] {
  if (!record(input)) fail(); exact(input, ["page", "width_points", "height_points", "operators", "raster_width", "raster_height", "statistics", "content_bounds"]);
  const page = positiveInt(input["page"]); if (page !== expectedPage) fail(); const width_points = boundedFinite(input["width_points"], MAX_POINTS); const height_points = boundedFinite(input["height_points"], MAX_POINTS); if (!pdfPointsMatchPaper(paper, width_points, height_points)) fail(); const operators = boundedNonnegative(input["operators"], MAX_OPERATORS); const raster_width = boundedPositive(input["raster_width"], PDF_MAX_PAGE_PIXELS); const raster_height = boundedPositive(input["raster_height"], PDF_MAX_PAGE_PIXELS); const pixels = raster_width * raster_height; if (!Number.isSafeInteger(pixels) || pixels > PDF_MAX_PAGE_PIXELS) fail();
  const statistics = pdfStatistics(input["statistics"], pixels); const bounds = input["content_bounds"]; const content_bounds = bounds === null ? null : parseBounds(bounds, raster_width, raster_height); const observation = { page, width_points, height_points, operators, raster_width, raster_height, statistics, content_bounds }; if (!validatePdfReceiptObservation(observation).ok) fail(); return observation;
}
function pdfStatistics(input: unknown, pixels: number) {
  if (!record(input)) fail(); exact(input, ["pixels", "visible_pixels", "painted_pixels", "differing_pixels", "color_count", "dominant_ratio", "luminance_variance", "entropy"]);
  const total = nonnegativeInt(input["pixels"]); if (total !== pixels) fail(); const visible_pixels = boundedNonnegative(input["visible_pixels"], total); const painted_pixels = boundedNonnegative(input["painted_pixels"], total); const differing_pixels = boundedNonnegative(input["differing_pixels"], visible_pixels); const color_count = boundedNonnegative(input["color_count"], 32_768); const dominant_ratio = ratio(input["dominant_ratio"]); const luminance_variance = finiteNonnegative(input["luminance_variance"]); const entropy = finiteNonnegative(input["entropy"]); return { pixels: total, visible_pixels, painted_pixels, differing_pixels, color_count, dominant_ratio, luminance_variance, entropy };
}
function pngStatistics(input: unknown, pixels: number) {
  if (!record(input)) fail(); exact(input, ["pixels", "visible_pixels", "differing_pixels", "dominant_ratio", "luminance_variance", "entropy"]); const total = nonnegativeInt(input["pixels"]); if (total !== pixels) fail(); const visible_pixels = boundedNonnegative(input["visible_pixels"], total); const differing_pixels = boundedNonnegative(input["differing_pixels"], visible_pixels); return { pixels: total, visible_pixels, differing_pixels, dominant_ratio: ratio(input["dominant_ratio"]), luminance_variance: finiteNonnegative(input["luminance_variance"]), entropy: finiteNonnegative(input["entropy"]) };
}
function parseBounds(input: unknown, width: number, height: number) { if (!record(input)) fail(); exact(input, ["left", "top", "right", "bottom"]); const left = boundedNonnegative(input["left"], width - 1); const top = boundedNonnegative(input["top"], height - 1); const right = boundedNonnegative(input["right"], width - 1); const bottom = boundedNonnegative(input["bottom"], height - 1); if (left > right || top > bottom) fail(); return { left, top, right, bottom }; }
function exact(value: Readonly<Record<string, unknown>>, keys: readonly string[]): void { if (Object.keys(value).length !== keys.length || !keys.every((key) => key in value)) fail(); }
function record(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): string { if (typeof value !== "string" || value.length === 0) fail(); return value; }
function positiveInt(value: unknown): number { return boundedPositive(value, Number.MAX_SAFE_INTEGER); }
function nonnegativeInt(value: unknown): number { return boundedNonnegative(value, Number.MAX_SAFE_INTEGER); }
function boundedPositive(value: unknown, max: number): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > max) fail(); return value; }
function boundedNonnegative(value: unknown, max: number): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max) fail(); return value; }
function boundedFinite(value: unknown, max: number): number { if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > max) fail(); return value; }
function finiteNonnegative(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(); return value; }
function ratio(value: unknown): number { const result = finiteNonnegative(value); if (result > 1) fail(); return result; }
function fail(): never { throw new TypeError("invalid_export_validation"); }
