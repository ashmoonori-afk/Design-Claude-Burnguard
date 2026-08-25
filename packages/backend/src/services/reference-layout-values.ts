import type {
  ReferenceLayoutContextV1,
  ReferenceLayoutMeasurement,
  ReferenceLayoutPreset,
  ReferenceLayoutUnit,
} from "@bg/shared";
import { rasterTarget } from "./reference-layout-export";

type Dimensions = {
  readonly width: number;
  readonly height: number;
  readonly unit: ReferenceLayoutUnit;
};

const INTENT_PATTERN =
  /\b(?:reference layout|match (?:the )?layout|blueprint|floor plan|drawing|underlay|paper size|canvas size|artboard)\b|참조\s*(?:레이아웃|이미지)|도면|설계도|평면도|밑그림|용지\s*(?:크기|사이즈)|출력\s*크기/iu;
const HARD_GEOMETRY_PATTERN =
  /\b(?:blueprint|floor plan|drawing|underlay|spatial plan)\b|도면|설계도|평면도|배치도|밑그림/iu;
const VISUAL_INSPIRATION_PATTERN =
  /\b(?:visual inspiration|style reference|mood reference)\b|스타일\s*참고|분위기\s*참고|시각\s*참고/iu;
const DIMENSION_PATTERN =
  /(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(mm|cm|inches?|in|px|밀리미터|센티미터|인치|픽셀)\b/iu;
const LABELLED_ASPECT_PATTERN =
  /(?:aspect(?:\s+ratio)?|종횡비|화면\s*비율)\s*(?:is|:|=)?\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/iu;
const DPI_PATTERN = /\b(\d{2,4})\s*dpi\b/iu;

const PRESETS: Readonly<
  Record<
    Exclude<ReferenceLayoutPreset, "custom">,
    Dimensions
  >
> = {
  a3: { width: 297, height: 420, unit: "mm" },
  a4: { width: 210, height: 297, unit: "mm" },
  letter: { width: 8.5, height: 11, unit: "in" },
  "widescreen-16x9": { width: 16, height: 9, unit: "in" },
  "standard-4x3": { width: 4, height: 3, unit: "in" },
};

export function hasReferenceLayoutIntent(request: string): boolean {
  return INTENT_PATTERN.test(request);
}

export function isReferenceLayoutAttachment(input: {
  readonly mime_type: string;
  readonly original_name: string;
}): boolean {
  if (
    input.mime_type.startsWith("image/") ||
    input.mime_type === "application/pdf"
  ) {
    return true;
  }
  return /\.(?:svg|ai|eps|dwg|dxf|pdf)$/iu.test(input.original_name);
}

export function parseReferenceLayoutCanvas(
  request: string,
): ReferenceLayoutContextV1["canvas"] {
  const dimensions = parseDimensions(request);
  const namedPreset = parsePreset(request);
  const preset =
    dimensions === null ? namedPreset : (namedPreset ?? "custom");
  const resolved =
    dimensions ?? (namedPreset === null ? null : PRESETS[namedPreset]);
  const orientation = parseOrientation(
    request,
    resolved?.width ?? null,
    resolved?.height ?? null,
  );
  const canvasDimensions =
    resolved === null ? null : orientDimensions(resolved, orientation);
  const dpi = parseDpi(request);
  const explicitAspect = parseAspectRatio(request);
  const aspectRatio =
    explicitAspect ??
    (canvasDimensions === null
      ? null
      : {
          width: canvasDimensions.width,
          height: canvasDimensions.height,
          source: dimensions === null ? "preset" : "dimensions",
        } as const);
  return {
    preset,
    width: canvasDimensions?.width ?? null,
    height: canvasDimensions?.height ?? null,
    unit: canvasDimensions?.unit ?? null,
    orientation,
    aspect_ratio: aspectRatio,
    dpi,
    scale: parseScale(request),
    bleed: parseMeasurement(request, /\bbleed\b|블리드|재단\s*여백/iu),
    safe_margin: parseMeasurement(
      request,
      /\bsafe(?:ty)?\s*margin\b|안전\s*여백/iu,
    ),
    raster_target_px: rasterTarget(canvasDimensions, dpi),
  };
}

export function referenceEvidenceBoundary(
  request: string,
): "hard_geometry" | "visual_inspiration" | "mixed" {
  const hard = HARD_GEOMETRY_PATTERN.test(request);
  const visual = VISUAL_INSPIRATION_PATTERN.test(request);
  return hard && !visual
    ? "hard_geometry"
    : visual && !hard
      ? "visual_inspiration"
      : "mixed";
}

export function referenceLanguage(
  request: string,
): "ko" | "en" | "unknown" {
  if (/[가-힣]/u.test(request)) return "ko";
  if (/[a-z]/iu.test(request)) return "en";
  return "unknown";
}

function parseDimensions(request: string): Dimensions | null {
  const match = request.match(DIMENSION_PATTERN);
  if (match === null) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const unit = normalizeUnit(match[3]);
  return Number.isFinite(width) && Number.isFinite(height) && unit !== null
    ? { width, height, unit }
    : null;
}

function parsePreset(
  request: string,
): Exclude<ReferenceLayoutPreset, "custom"> | null {
  if (/\bA3\b/iu.test(request)) return "a3";
  if (/\bA4\b/iu.test(request)) return "a4";
  if (/\b(?:US\s*)?Letter\b/iu.test(request)) return "letter";
  if (/\b(?:16\s*:\s*9|widescreen)\b/iu.test(request)) {
    return "widescreen-16x9";
  }
  if (/\b(?:4\s*:\s*3|standard)\b/iu.test(request)) return "standard-4x3";
  return null;
}

function parseOrientation(
  request: string,
  width: number | null,
  height: number | null,
): "portrait" | "landscape" | "unknown" {
  if (/\bportrait\b|세로/iu.test(request)) return "portrait";
  if (/\blandscape\b|가로/iu.test(request)) return "landscape";
  if (width === null || height === null || width === height) return "unknown";
  return width > height ? "landscape" : "portrait";
}

function orientDimensions(
  dimensions: Dimensions,
  orientation: "portrait" | "landscape" | "unknown",
): Dimensions {
  const shouldSwap =
    (orientation === "landscape" && dimensions.width < dimensions.height) ||
    (orientation === "portrait" && dimensions.width > dimensions.height);
  return shouldSwap
    ? { ...dimensions, width: dimensions.height, height: dimensions.width }
    : dimensions;
}

function parseAspectRatio(request: string): {
  readonly width: number;
  readonly height: number;
  readonly source: "explicit";
} | null {
  const match =
    request.match(LABELLED_ASPECT_PATTERN) ??
    request.match(/\b(16)\s*:\s*(9)\b/u) ??
    request.match(/\b(4)\s*:\s*(3)\b/u);
  if (match === null) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width > 0 && height > 0
    ? { width, height, source: "explicit" }
    : null;
}

function parseDpi(request: string): number | null {
  const value = request.match(DPI_PATTERN)?.[1];
  if (value === undefined) return null;
  const dpi = Number(value);
  return dpi >= 36 && dpi <= 2400 ? dpi : null;
}

function parseScale(request: string):
  | { readonly status: "known"; readonly value: string }
  | { readonly status: "unknown"; readonly value: null } {
  const known = request.match(
    /\bscale\s*(?:is|:|=)?\s*(1\s*:\s*\d+)\b|축척\s*(?:은|:|=)?\s*(1\s*:\s*\d+)/iu,
  );
  const value = known?.[1] ?? known?.[2];
  return value === undefined
    ? { status: "unknown", value: null }
    : { status: "known", value: value.replace(/\s/gu, "") };
}

function parseMeasurement(
  request: string,
  label: RegExp,
): ReferenceLayoutMeasurement {
  const index = request.search(label);
  if (index < 0) return { status: "unknown", value: null, unit: null };
  const tail = request.slice(index).replace(label, "").slice(0, 64);
  const clause =
    tail.split(/[,;\n]|[.](?=\s*[A-Za-z가-힣])/u, 1)[0] ?? tail;
  if (/unknown|unspecified|미정|알\s*수\s*없/iu.test(clause)) {
    return { status: "unknown", value: null, unit: null };
  }
  const match = clause.match(
    /(\d+(?:\.\d+)?)\s*(mm|cm|inches?|in|px|밀리미터|센티미터|인치|픽셀)\b/iu,
  );
  const unit = normalizeUnit(match?.[2]);
  return match === null || unit === null
    ? { status: "unknown", value: null, unit: null }
    : { status: "known", value: Number(match[1]), unit };
}

function normalizeUnit(value: string | undefined): ReferenceLayoutUnit | null {
  if (value === undefined) return null;
  const normalized = value.toLowerCase();
  if (normalized === "mm" || normalized === "밀리미터") return "mm";
  if (normalized === "cm" || normalized === "센티미터") return "cm";
  if (
    normalized === "in" ||
    normalized === "inch" ||
    normalized === "inches" ||
    normalized === "인치"
  ) {
    return "in";
  }
  if (normalized === "px" || normalized === "픽셀") return "px";
  return null;
}
