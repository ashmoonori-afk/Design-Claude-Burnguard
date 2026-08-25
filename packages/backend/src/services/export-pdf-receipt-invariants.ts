import { isPdfSingleEdgeClipped, pdfRasterDimensions } from "./export-pdf-contract";
import type { PdfPageObservation } from "./export-pdf-validation";

const MIN_MEANINGFUL_RATIO = 0.001;
// Covers accumulated IEEE-754 error in log2 and factored finite-sample arithmetic, not invalid receipt slack.
const ENTROPY_EPSILON = 64 * Number.EPSILON;
const VARIANCE_EPSILON = 256 * Number.EPSILON * 65_025;
export type PdfReceiptInvariantCode = "raster_dimensions" | "pixel_total" | "visible_pixels" | "painted_pixels" | "differing_pixels" | "color_count" | "color_histogram" | "paint_feasibility" | "dominant_ratio" | "luminance_variance" | "entropy" | "validated_threshold" | "content_bounds" | "content_bounds_area" | "clipped_page";
export type PdfReceiptInvariantResult = { readonly ok: true } | { readonly ok: false; readonly code: PdfReceiptInvariantCode };

export function validatePdfReceiptObservation(observation: PdfPageObservation): PdfReceiptInvariantResult {
  const { raster_width: width, raster_height: height, statistics: s, content_bounds: bounds } = observation; const expected = pdfRasterDimensions(observation.width_points, observation.height_points);
  if (width !== expected.width || height !== expected.height) return failure("raster_dimensions");
  const pixels = width * height; if (!Number.isSafeInteger(pixels) || s.pixels !== pixels) return failure("pixel_total");
  const visible = s.visible_pixels; const painted = s.painted_pixels; const differing = s.differing_pixels; const colors = s.color_count;
  if (!integerWithin(visible, 1, pixels)) return failure("visible_pixels"); if (!integerWithin(painted, 0, visible)) return failure("painted_pixels");
  if ((bounds !== null) !== (painted > 0)) return failure("content_bounds"); if (painted === 0) return failure("painted_pixels");
  if (!Number.isSafeInteger(differing) || differing < 0 || differing >= visible) return failure("differing_pixels"); if (!integerWithin(colors, 1, visible)) return failure("color_count");
  const dominant = visible - differing; const minorities = colors - 1;
  if (minorities > differing || differing > minorities * dominant) return failure("color_histogram");
  const background = visible - painted; const paintedColors = colors - (background > 0 ? 1 : 0);
  if (background > dominant || paintedColors > painted || painted > paintedColors * dominant || (background !== dominant && painted < dominant + paintedColors - 1) || painted > pixels - 1) return failure("paint_feasibility");
  if (!Number.isFinite(s.dominant_ratio) || s.dominant_ratio !== dominant / visible) return failure("dominant_ratio");
  const varianceMinimum = (visible - 1) / visible / visible; const lowHalf = Math.floor(visible / 2) / visible; const highHalf = Math.ceil(visible / 2) / visible; const varianceMaximum = 65_025 * lowHalf * highHalf;
  if (!Number.isFinite(s.luminance_variance) || s.luminance_variance + VARIANCE_EPSILON < varianceMinimum || s.luminance_variance > varianceMaximum + VARIANCE_EPSILON) return failure("luminance_variance");
  const support = Math.min(256, visible, Math.min(dominant, 8) + Math.min(differing, 8 * minorities)); const entropyMinimum = binaryOneOutlierEntropy(visible); const entropyMaximum = balancedEntropyMaximum(visible, support); const entropyEpsilon = ENTROPY_EPSILON * Math.max(1, entropyMaximum);
  if (!Number.isFinite(s.entropy) || s.entropy + entropyEpsilon < entropyMinimum || s.entropy > entropyMaximum + entropyEpsilon) return failure("entropy");
  if (visible / pixels < MIN_MEANINGFUL_RATIO || painted / pixels < MIN_MEANINGFUL_RATIO || colors <= 1 || differing / visible < MIN_MEANINGFUL_RATIO) return failure("validated_threshold");
  if (bounds === null) return failure("content_bounds"); const boundsWidth = bounds.right - bounds.left + 1; const boundsHeight = bounds.bottom - bounds.top + 1; const area = boundsWidth * boundsHeight;
  if (!Number.isSafeInteger(area) || area < painted || ((painted === 1) !== (area === 1))) return failure("content_bounds_area");
  if (isPdfSingleEdgeClipped(bounds, width, height, painted, pixels)) return failure("clipped_page"); return { ok: true };
}
export function balancedEntropyMaximum(samples: number, support: number): number { const quotient = Math.floor(samples / support); const remainder = samples % support; return entropyTerm(quotient + 1, remainder, samples) + entropyTerm(quotient, support - remainder, samples); }
export function binaryOneOutlierEntropy(samples: number): number { return entropyTerm(1, 1, samples) + entropyTerm(samples - 1, 1, samples); }
function entropyTerm(count: number, bins: number, samples: number): number { if (count === 0 || bins === 0) return 0; const probability = count / samples; return -bins * probability * Math.log2(probability); }
function integerWithin(value: number, minimum: number, maximum: number): boolean { return Number.isSafeInteger(value) && value >= minimum && value <= maximum; }
function failure(code: PdfReceiptInvariantCode): PdfReceiptInvariantResult { return { ok: false, code }; }
