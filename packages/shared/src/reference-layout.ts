export type ReferenceLayoutUnit = "mm" | "cm" | "in" | "px";
export type ReferenceLayoutOrientation =
  | "portrait"
  | "landscape"
  | "unknown";
export type ReferenceLayoutPreset =
  | "a3"
  | "a4"
  | "letter"
  | "widescreen-16x9"
  | "standard-4x3"
  | "custom";

export type ReferenceLayoutMeasurement =
  | {
      readonly status: "known";
      readonly value: number;
      readonly unit: ReferenceLayoutUnit;
    }
  | {
      readonly status: "unknown";
      readonly value: null;
      readonly unit: null;
    };

export type ReferenceLayoutScale =
  | { readonly status: "known"; readonly value: string }
  | { readonly status: "unknown"; readonly value: null };

export type ReferenceLayoutContextV1 = {
  readonly schema_version: 1;
  readonly layout_spec_path: "layout-spec.json";
  readonly intent: {
    readonly detected: true;
    readonly source:
      | "request"
      | "attachment"
      | "request_and_attachment";
    readonly language: "ko" | "en" | "unknown";
  };
  readonly reference: {
    readonly attachment_path: string;
    readonly original_name: string;
    readonly mime_type: string;
    readonly role: "immutable_underlay";
    readonly evidence_boundary:
      | "hard_geometry"
      | "visual_inspiration"
      | "mixed";
    readonly editable: false;
  } | null;
  readonly canvas: {
    readonly preset: ReferenceLayoutPreset | null;
    readonly width: number | null;
    readonly height: number | null;
    readonly unit: ReferenceLayoutUnit | null;
    readonly orientation: ReferenceLayoutOrientation;
    readonly aspect_ratio: {
      readonly width: number;
      readonly height: number;
      readonly source: "explicit" | "dimensions" | "preset";
    } | null;
    readonly dpi: number | null;
    readonly scale: ReferenceLayoutScale;
    readonly bleed: ReferenceLayoutMeasurement;
    readonly safe_margin: ReferenceLayoutMeasurement;
    readonly raster_target_px:
      | {
          readonly status: "known";
          readonly width: number;
          readonly height: number;
        }
      | {
          readonly status: "unknown";
          readonly width: null;
          readonly height: null;
        };
  };
  readonly geometry_contract: {
    readonly origin: "top_left";
    readonly x_axis: "right";
    readonly y_axis: "down";
    readonly anchor_space: "normalized_0_1";
    readonly stable_anchors_required: true;
    readonly preserve_aspect_ratio: true;
  };
  readonly export_constraints: {
    readonly pdf: ReferenceLayoutExportCapability;
    readonly pptx: ReferenceLayoutExportCapability;
    readonly png: ReferenceLayoutExportCapability;
  };
};

export type ReferenceLayoutExportCapability = {
  readonly supported: boolean;
  readonly limitation:
    | "preset_only"
    | "aspect_presets_only"
    | "explicit_pixel_dimensions";
  readonly coerce_to_a4: false;
  readonly on_unsupported: "report_and_preserve_spec";
};
