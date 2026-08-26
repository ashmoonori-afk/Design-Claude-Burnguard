import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { ulid } from "ulid";
import { getAttachmentContext, insertAttachmentRecord } from "../db/attachment-context";
import { assertSafeName, resolveWithin } from "../security/path-boundary";
import { inferUploadKind } from "./upload-kind";
export { attachmentExtractedTextPath, attachmentSummaryPath } from "./attachment-paths";

/** Authoritative intake limits. The composer mirrors these for early feedback only. */
export const ATTACHMENT_LIMITS = {
  maxCount: 8,
  maxBytesPerFile: 10 * 1024 * 1024,
  maxBytesTotal: 25 * 1024 * 1024,
} as const;

/** Raised when an upload's kind is one `inferUploadKind` cannot resolve to an extractor. */
export class UnsupportedAttachmentKindError extends Error {
  readonly name = "UnsupportedAttachmentKindError";
  readonly code = "unsupported_file_kind";
  readonly fileNames: readonly string[];

  constructor(fileNames: readonly string[]) {
    super(`unsupported_file_kind:${fileNames.join(",")}`);
    this.fileNames = fileNames;
  }
}

export async function saveSessionAttachments(sessionId: string, files: File[]) {
  const context = getAttachmentContext(sessionId);
  if (!context) {
    throw new Error("session_not_found");
  }

  if (files.length > ATTACHMENT_LIMITS.maxCount) {
    throw new Error(`attachment_limit_exceeded:${ATTACHMENT_LIMITS.maxCount}`);
  }

  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  const oversized = files.find((file) => file.size > ATTACHMENT_LIMITS.maxBytesPerFile);
  if (oversized !== undefined) throw new Error(`attachment_too_large:${oversized.name || "attachment"}:${ATTACHMENT_LIMITS.maxBytesPerFile}`);
  if (totalBytes > ATTACHMENT_LIMITS.maxBytesTotal) throw new Error(`attachment_total_too_large:${ATTACHMENT_LIMITS.maxBytesTotal}`);

  // Kind gate runs before any write so a batch containing a source the
  // extractor cannot process persists nothing at all.
  const unsupported = files.filter((file) => inferUploadKind(file.name || "attachment", file.type) === null);
  if (unsupported.length > 0) {
    throw new UnsupportedAttachmentKindError(unsupported.map((file) => file.name || "attachment"));
  }

  const attachmentsDir = resolveWithin(context.project_dir, ".attachments");
  await mkdir(attachmentsDir, { recursive: true });
  const records: string[] = [];

  for (const file of files) {
    const base = sanitize(file.name || "attachment");
    const storedName = assertSafeName(`${ulid()}-${base}`);
    const absolutePath = resolveWithin(
      context.project_dir,
      ".attachments",
      storedName,
    );
    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");

    await writeFile(absolutePath, buffer);
    const manifestPath = resolveWithin(
      context.project_dir,
      ".attachments",
      assertSafeName(`${storedName}.summary.json`),
    );
    const extractedTextPath = resolveWithin(
      context.project_dir,
      ".attachments",
      assertSafeName(`${storedName}.extracted.md`),
    );
    const { extractAttachmentUpload } = await import("./attachment-extraction");
    await extractAttachmentUpload({ sourcePath: absolutePath, manifestPath, extractedTextPath, originalName: file.name || storedName });

    insertAttachmentRecord({
      sessionId,
      filePath: absolutePath,
      mimeType: file.type || "application/octet-stream",
      originalName: file.name || storedName,
      sizeBytes: buffer.byteLength,
      sha256,
    });
    records.push(absolutePath);
  }

  return records;
}

function sanitize(value: string) {
  return value.replace(/[^\w.-]+/g, "_");
}
