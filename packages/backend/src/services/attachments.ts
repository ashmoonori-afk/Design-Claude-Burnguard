import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ulid } from "ulid";
import { insertAttachment } from "../db/attachments";
import { getSessionProject } from "../db/events";
import {
  inferUploadKind,
  runPythonUploadExtractor,
} from "./design-system-extract";

const MAX_ATTACHMENT_COUNT = 8;
const MAX_ATTACHMENT_BYTES_PER_FILE = 10 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES_TOTAL = 25 * 1024 * 1024;

export async function saveSessionAttachments(sessionId: string, files: File[]) {
  const context = await getSessionProject(sessionId);
  if (!context) {
    throw new Error("session_not_found");
  }

  if (files.length > MAX_ATTACHMENT_COUNT) {
    throw new Error(`attachment_limit_exceeded:${MAX_ATTACHMENT_COUNT}`);
  }

  const attachmentsDir = path.join(context.project_dir, ".attachments");
  await mkdir(attachmentsDir, { recursive: true });

  const records: string[] = [];
  let totalBytes = 0;

  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES_PER_FILE) {
      throw new Error(
        `attachment_too_large:${file.name || "attachment"}:${MAX_ATTACHMENT_BYTES_PER_FILE}`,
      );
    }
    totalBytes += file.size;
    if (totalBytes > MAX_ATTACHMENT_BYTES_TOTAL) {
      throw new Error(`attachment_total_too_large:${MAX_ATTACHMENT_BYTES_TOTAL}`);
    }

    const base = sanitize(file.name || "attachment");
    const storedName = `${ulid()}-${base}`;
    const absolutePath = path.join(attachmentsDir, storedName);
    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");

    await writeFile(absolutePath, buffer);
    const uploadKind = inferUploadKind(file.name || storedName, file.type);
    if (uploadKind) {
      const manifestPath = attachmentSummaryPath(absolutePath);
      try {
        await runPythonUploadExtractor({
          sourcePath: absolutePath,
          manifestPath,
        });
      } catch (error) {
        await rm(absolutePath, { force: true }).catch(() => {});
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `attachment_extract_failed:${file.name || storedName}:${message}`,
        );
      }
    }

    await insertAttachment({
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

export function attachmentSummaryPath(filePath: string) {
  return `${filePath}.summary.json`;
}
