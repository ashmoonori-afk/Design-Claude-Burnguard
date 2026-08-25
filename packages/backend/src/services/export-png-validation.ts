const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PIXELS = 16_000_000;

type PngHeader = { readonly width: number; readonly height: number };
export type PixelStatistics = {
  readonly pixels: number;
  readonly visible_pixels: number;
  readonly differing_pixels: number;
  readonly dominant_ratio: number;
  readonly luminance_variance: number;
  readonly entropy: number;
};
export type PngValidation = PngHeader & { readonly statistics: PixelStatistics };

export class PngValidationError extends Error {
  readonly name = "PngValidationError";
  constructor(readonly code: "invalid_png" | "dimension_mismatch" | "transparent" | "blank" | "one_color" | "pixel_limit") { super(code); }
}

export function parsePng(bytes: Uint8Array): PngHeader {
  if (bytes.length < 33 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) fail("invalid_png");
  let offset = 8;
  let header: PngHeader | null = null;
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = u32(bytes, offset);
    const end = offset + 12 + length;
    if (end > bytes.length) fail("invalid_png");
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== u32(bytes, offset + 8 + length)) fail("invalid_png");
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13 || header !== null || data[8] !== 8 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0) fail("invalid_png");
      const width = u32(data, 0); const height = u32(data, 4);
      if (width === 0 || height === 0 || width * height > MAX_PIXELS) fail("pixel_limit");
      header = { width, height };
    }
    if (type === "IEND") { if (length !== 0) fail("invalid_png"); ended = true; offset = end; break; }
    offset = end;
  }
  if (header === null || !ended || offset !== bytes.length) fail("invalid_png");
  return header;
}

export function analyzePixels(rgba: Uint8Array, width: number, height: number): PixelStatistics {
  const pixels = width * height;
  if (pixels === 0 || pixels > MAX_PIXELS || rgba.length !== pixels * 4) fail("invalid_png");
  const colors = new Map<number, number>();
  const luminanceHistogram = new Uint32Array(256);
  let visible = 0; let sum = 0; let sumSquares = 0;
  for (let index = 0; index < rgba.length; index += 4) {
    const alpha = rgba[index + 3] ?? 0;
    if (alpha <= 2) continue;
    const red = rgba[index] ?? 0; const green = rgba[index + 1] ?? 0; const blue = rgba[index + 2] ?? 0;
    const key = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
    colors.set(key, (colors.get(key) ?? 0) + 1);
    const luminance = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
    luminanceHistogram[luminance] = (luminanceHistogram[luminance] ?? 0) + 1;
    visible += 1; sum += luminance; sumSquares += luminance * luminance;
  }
  let dominant = 0;
  for (const count of colors.values()) dominant = Math.max(dominant, count);
  const differing = visible - dominant;
  const mean = sum / visible;
  const variance = Math.max(0, sumSquares / visible - mean * mean);
  let entropy = 0;
  for (const count of luminanceHistogram) if (count > 0) { const probability = count / visible; entropy -= probability * Math.log2(probability); }
  const statistics = { pixels, visible_pixels: visible, differing_pixels: differing, dominant_ratio: dominant / Math.max(1, visible), luminance_variance: variance, entropy };
  requireMeaningfulPixels(statistics, colors.size);
  return statistics;
}

export function validateDecodedPng(bytes: Uint8Array, rgba: Uint8Array, expected: PngHeader): PngValidation {
  const header = parsePng(bytes);
  if (header.width !== expected.width || header.height !== expected.height) fail("dimension_mismatch");
  return { ...header, statistics: analyzePixels(rgba, header.width, header.height) };
}

export function validatePngStatistics(bytes: Uint8Array, expected: PngHeader, statistics: PixelStatistics): PngValidation {
  const header = parsePng(bytes);
  if (header.width !== expected.width || header.height !== expected.height || statistics.pixels !== header.width * header.height) fail("dimension_mismatch");
  requireMeaningfulPixels(statistics, statistics.differing_pixels === 0 ? 1 : 2);
  return { ...header, statistics };
}

function requireMeaningfulPixels(statistics: PixelStatistics, colors: number): void {
  if (statistics.visible_pixels / statistics.pixels < 0.001) fail("transparent");
  if (colors <= 1) fail("one_color");
  if (statistics.differing_pixels / statistics.visible_pixels < 0.001 || statistics.luminance_variance === 0 || statistics.entropy === 0) fail("blank");
}

function u32(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] ?? 0) * 0x1000000) + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0)) >>> 0;
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function fail(code: PngValidationError["code"]): never { throw new PngValidationError(code); }
