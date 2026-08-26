import path from "node:path";
import type { ReferenceLayoutContextV1, UploadedVisualSourceSelection, VisualSourceRole } from "@bg/shared";
import {
  hasReferenceLayoutIntent,
  isReferenceLayoutAttachment,
  parseReferenceLayoutCanvas,
  referenceEvidenceBoundary,
  referenceLanguage,
} from "./reference-layout-values";
import { referenceExportConstraints } from "./reference-layout-export";
import type { StageAttachmentInput } from "./stage-attachment-inputs";

export type ReferenceLayoutAttachment = {
  readonly file_path: string;
  readonly mime_type: string;
  readonly original_name: string;
  readonly source_role?: VisualSourceRole;
  readonly source_role_explicit?: boolean;
};

export type ReferenceLayoutInput = {
  readonly request: string;
  readonly attachments: readonly ReferenceLayoutAttachment[];
  readonly requestedPaths: readonly string[];
  readonly selections?: readonly UploadedVisualSourceSelection[];
  readonly projectDir?: string;
  readonly stageInputs?: readonly StageAttachmentInput[];
};

export function buildReferenceLayoutContext(
  input: ReferenceLayoutInput,
): ReferenceLayoutContextV1 | null {
  const requestDetected = hasReferenceLayoutIntent(input.request);
  const selected = input.attachments.filter((attachment) => {
    if (!input.requestedPaths.includes(attachment.file_path)) return false;
    if (attachment.source_role === "immutable_reference") return true;
    if (attachment.source_role_explicit === true) return false;
    const explicit = input.selections?.find((selection) => selection.attachment_path === attachment.file_path);
    return explicit?.role === "immutable_reference" || isReferenceLayoutAttachment(attachment, requestDetected);
  });
  if (!requestDetected && selected.length === 0) return null;

  const reference = selected[0] ?? null;
  const stageReference = reference === null ? undefined : input.stageInputs?.find((candidate) => candidate.attachmentPath === reference.file_path);
  const relativeReference = reference === null || input.projectDir === undefined ? null : path.relative(input.projectDir, reference.file_path).replaceAll("\\", "/");
  const referencePath = stageReference?.sourcePath ?? (relativeReference !== null && !relativeReference.startsWith("../") && relativeReference !== ".." ? relativeReference : reference?.file_path ?? null);
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
            attachment_path: referencePath ?? reference.file_path,
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
