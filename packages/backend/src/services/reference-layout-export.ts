import type {
  ReferenceLayoutContextV1,
  ReferenceLayoutUnit,
} from "@bg/shared";

type Dimensions = {
  readonly width: number;
  readonly height: number;
  readonly unit: ReferenceLayoutUnit;
};

export function rasterTarget(
  dimensions: Dimensions | null,
  dpi: number | null,
): ReferenceLayoutContextV1["canvas"]["raster_target_px"] {
  if (dimensions === null) {
    return { status: "unknown", width: null, height: null };
  }
  if (dimensions.unit === "px") {
    return {
      status: "known",
      width: Math.round(dimensions.width),
      height: Math.round(dimensions.height),
    };
  }
  if (dpi === null) return { status: "unknown", width: null, height: null };
  const inches =
    dimensions.unit === "in"
      ? 1
      : dimensions.unit === "cm"
        ? 1 / 2.54
        : 1 / 25.4;
  return {
    status: "known",
    width: Math.round(dimensions.width * inches * dpi),
    height: Math.round(dimensions.height * inches * dpi),
  };
}

export function referenceExportConstraints(
  canvas: ReferenceLayoutContextV1["canvas"],
): ReferenceLayoutContextV1["export_constraints"] {
  return {
    pdf: exportCapability(
      canvas.preset === "a4" ||
        canvas.preset === "letter" ||
        canvas.preset === "widescreen-16x9",
      "preset_only",
    ),
    pptx: exportCapability(
      canvas.preset === "widescreen-16x9" ||
        canvas.preset === "standard-4x3",
      "aspect_presets_only",
    ),
    png: exportCapability(
      canvas.raster_target_px.status === "known",
      "explicit_pixel_dimensions",
    ),
  };
}

function exportCapability(
  supported: boolean,
  limitation: "preset_only" | "aspect_presets_only" | "explicit_pixel_dimensions",
) {
  return {
    supported,
    limitation,
    coerce_to_a4: false,
    on_unsupported: "report_and_preserve_spec",
  } as const;
}
