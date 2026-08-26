import { createHash } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import type {
  UploadedVisualSourceSelection,
  VisualSourceManifestEntry,
  VisualSourceManifestV1,
  VisualSourceRole,
} from "@bg/shared";
import { resolveWithin } from "../security/path-boundary";

export type VisualSourceAttachment = {
  readonly id: string;
  readonly session_id: string;
  readonly turn_id: string | null;
  readonly file_path: string;
  readonly mime_type: string;
  readonly original_name: string;
  readonly size_bytes: number;
  readonly sha256: string | null;
  readonly source_role: VisualSourceRole;
  readonly source_role_explicit: boolean;
};

export class VisualSourceProvenanceError extends Error {
  readonly name = "VisualSourceProvenanceError";
  readonly code = "invalid_visual_source_provenance";
  constructor() {
    super("invalid_visual_source_provenance");
  }
}

export async function buildVisualSourceManifest(input: {
  readonly projectDir: string;
  readonly attachments: readonly VisualSourceAttachment[];
  readonly requestedPaths: readonly string[];
  readonly selections: readonly UploadedVisualSourceSelection[] | undefined;
}): Promise<VisualSourceManifestV1 | null> {
  if (input.requestedPaths.length === 0) return null;
  const selectedAttachments = input.requestedPaths.map((requestedPath) => input.attachments.find((attachment) => attachment.file_path === requestedPath));
  if (selectedAttachments.some((attachment) => attachment === undefined)) fail();
  const selections = input.selections === undefined || input.selections.length === 0
    ? selectedAttachments.map((attachment) => ({ source_type: "uploaded_attachment" as const, attachment_path: attachment?.file_path ?? "", role: attachment?.source_role ?? "ordinary_content" }))
    : input.selections;
  const uniquePaths = new Set(selections.map((selection) => selection.attachment_path));
  if (uniquePaths.size !== selections.length || selections.length !== input.requestedPaths.length) fail();
  const sources: VisualSourceManifestEntry[] = [];
  for (const selection of selections) {
    const attachment = input.attachments.find((candidate) => candidate.file_path === selection.attachment_path);
    if (attachment === undefined || attachment.source_role !== selection.role) fail();
    try {
      sources.push(await manifestEntry(input.projectDir, attachment));
    } catch (error) {
      if (error instanceof VisualSourceProvenanceError) throw error;
      fail();
    }
  }
  return { schema_version: 1, network_sources: "unsupported", sources };
}

async function manifestEntry(projectDir: string, attachment: VisualSourceAttachment): Promise<VisualSourceManifestEntry> {
  if (attachment.turn_id === null || attachment.sha256 === null || !/^[a-f0-9]{64}$/u.test(attachment.sha256)) fail();
  const attachmentsDir = resolveWithin(projectDir, ".attachments");
  const managedPath = resolveWithin(attachmentsDir, path.basename(attachment.file_path));
  if (managedPath !== attachment.file_path || path.dirname(managedPath) !== attachmentsDir) fail();
  const bytes = await readFile(managedPath).catch(() => fail());
  if (bytes.byteLength !== attachment.size_bytes || createHash("sha256").update(bytes).digest("hex") !== attachment.sha256) fail();
  const common = {
    source_type: "uploaded_attachment" as const,
    attachment_id: attachment.id,
    original_name: attachment.original_name,
    mime_type: attachment.mime_type,
    size_bytes: attachment.size_bytes,
    preflight_verified_sha256: attachment.sha256,
    managed_path: `.attachments/${path.basename(managedPath)}`,
    role_origin: attachment.source_role_explicit ? "explicit" as const : "legacy_inferred" as const,
    provenance: {
      session_id: attachment.session_id,
      turn_id: attachment.turn_id,
      storage: "managed_attachment" as const,
    },
  };
  if (attachment.source_role === "ordinary_content") return { ...common, role: "ordinary_content" };
  return {
    ...common,
    role: "immutable_reference",
    policy: {
      original_file: "preserve",
      original_hash: "preserve",
      never_overwrite: true,
      never_copy_into_authored_output: true,
      derived_artifact: "separate",
    },
  };
}

function fail(): never {
  throw new VisualSourceProvenanceError();
}
