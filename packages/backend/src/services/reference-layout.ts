import type { ReferenceLayoutContextV1 } from "@bg/shared";
import {
  hasReferenceLayoutIntent,
  isReferenceLayoutAttachment,
  parseReferenceLayoutCanvas,
  referenceEvidenceBoundary,
  referenceLanguage,
} from "./reference-layout-values";
import { referenceExportConstraints } from "./reference-layout-export";

export type ReferenceLayoutAttachment = {
  readonly file_path: string;
  readonly mime_type: string;
  readonly original_name: string;
};

export type ReferenceLayoutInput = {
  readonly request: string;
  readonly attachments: readonly ReferenceLayoutAttachment[];
  readonly requestedPaths: readonly string[];
};

export function buildReferenceLayoutContext(
  input: ReferenceLayoutInput,
): ReferenceLayoutContextV1 | null {
  const selected = input.attachments.filter(
    (attachment) =>
      input.requestedPaths.includes(attachment.file_path) &&
      isReferenceLayoutAttachment(attachment),
  );
  const requestDetected = hasReferenceLayoutIntent(input.request);
  if (!requestDetected && selected.length === 0) return null;

  const reference = selected[0] ?? null;
  const canvas = parseReferenceLayoutCanvas(input.request);
  return {
    schema_version: 1,
    layout_spec_path: "layout-spec.json",
    intent: {
      detected: true,
      source:
        requestDetected && reference !== null
          ? "request_and_attachment"
          : requestDetected
            ? "request"
            : "attachment",
      language: referenceLanguage(input.request),
    },
    reference:
      reference === null
        ? null
        : {
            attachment_path: reference.file_path,
            original_name: reference.original_name,
            mime_type: reference.mime_type,
            role: "immutable_underlay",
            evidence_boundary: referenceEvidenceBoundary(input.request),
            editable: false,
          },
    canvas,
    geometry_contract: {
      origin: "top_left",
      x_axis: "right",
      y_axis: "down",
      anchor_space: "normalized_0_1",
      stable_anchors_required: true,
      preserve_aspect_ratio: true,
    },
    export_constraints: referenceExportConstraints(canvas),
  };
}
