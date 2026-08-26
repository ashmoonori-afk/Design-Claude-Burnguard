import {
  UpgradeContractError,
  decodeContract,
  requiredNumber,
} from "./contract-parser";

export const GRAPHIC_CANVAS_LIMITS = {
  minWidth: 320,
  maxWidth: 4096,
  minHeight: 240,
  maxHeight: 4096,
  maxPixels: 16_000_000,
} as const;

export type GraphicCanvasV1 = {
  readonly schema_version: 1;
  readonly width: number;
  readonly height: number;
};

export function parseGraphicCanvasV1(input: unknown): GraphicCanvasV1 {
  const record = decodeContract(input);
  for (const key of Object.keys(record)) {
    if (key !== "schema_version" && key !== "width" && key !== "height") {
      invalid(key);
    }
  }
  if (requiredNumber(record, "schema_version") !== 1) {
    invalid("schema_version");
  }
  const width = requiredNumber(record, "width");
  const height = requiredNumber(record, "height");
  if (width < GRAPHIC_CANVAS_LIMITS.minWidth || width > GRAPHIC_CANVAS_LIMITS.maxWidth) {
    invalid("width");
  }
  if (height < GRAPHIC_CANVAS_LIMITS.minHeight || height > GRAPHIC_CANVAS_LIMITS.maxHeight) {
    invalid("height");
  }
  if (width * height > GRAPHIC_CANVAS_LIMITS.maxPixels) {
    invalid("width");
  }
  return { schema_version: 1, width, height };
}

function invalid(path: string): never {
  throw new UpgradeContractError("invalid_field", path);
}
