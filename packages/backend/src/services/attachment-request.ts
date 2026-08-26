import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { UploadedVisualSourceSelection } from "@bg/shared";
import { listSessionAttachments } from "../db/attachments";
import { getAttachmentContext } from "../db/attachment-context";
import { resolveWithin } from "../security/path-boundary";

export class AttachmentRequestError extends Error {
  readonly name = "AttachmentRequestError";
  readonly code = "invalid_attachments";
  constructor() { super("invalid_attachments"); }
}

export async function canonicalizeAttachmentRequest(input: {
  readonly sessionId: string;
  readonly requestedPaths: readonly string[];
  readonly selections?: readonly UploadedVisualSourceSelection[];
}): Promise<{ readonly paths: readonly string[]; readonly selections: readonly UploadedVisualSourceSelection[] }> {
  if (new Set(input.requestedPaths).size !== input.requestedPaths.length) fail();
  const context = getAttachmentContext(input.sessionId);
  if (context === null) fail();
  const rows = await listSessionAttachments(input.sessionId);
  const attachmentsDir = resolveWithin(context.project_dir, ".attachments");
  const selected: typeof rows = [];
  for (const requestedPath of input.requestedPaths) {
    if (/\r|\n|\0/u.test(requestedPath) || /^https?:\/\//iu.test(requestedPath)) fail();
    const row = rows.find((candidate) => candidate.file_path === requestedPath);
    if (row === undefined || row.turn_id !== null || row.sha256 === null) fail();
    try {
      const canonical = resolveWithin(attachmentsDir, path.basename(row.file_path));
      if (canonical !== row.file_path || path.dirname(canonical) !== attachmentsDir) fail();
      const bytes = await readFile(canonical);
      if (bytes.byteLength !== row.size_bytes || createHash("sha256").update(bytes).digest("hex") !== row.sha256) fail();
    } catch (error) {
      if (error instanceof AttachmentRequestError) throw error;
      fail();
    }
    selected.push(row);
  }
  const explicit = input.selections ?? [];
  if (explicit.length > 0) {
    if (explicit.length !== selected.length || new Set(explicit.map((item) => item.attachment_path)).size !== explicit.length) fail();
    for (const row of selected) {
      const selection = explicit.find((item) => item.attachment_path === row.file_path);
      if (selection === undefined || selection.role !== row.source_role) fail();
    }
  }
  return {
    paths: selected.map((row) => row.file_path),
    selections: selected.map((row) => ({ source_type: "uploaded_attachment", attachment_path: row.file_path, role: row.source_role })),
  };
}

function fail(): never { throw new AttachmentRequestError(); }
