import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ulid } from "ulid";
import { insertAttachment } from "../db/attachments";
import { getSessionProject } from "../db/events";
import {
  inferUploadKind,
  readUploadManifest,
  runPythonUploadExtractor,
  type UploadManifest,
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
        const manifest = await readUploadManifest(manifestPath);
        await writeFile(
          attachmentExtractedTextPath(absolutePath),
          renderAttachmentExtract(manifest, file.name || storedName),
          "utf8",
        );
      } catch (error) {
        await rm(absolutePath, { force: true }).catch(() => {});
        await rm(manifestPath, { force: true }).catch(() => {});
        await rm(attachmentExtractedTextPath(absolutePath), {
          force: true,
        }).catch(() => {});
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

export function attachmentExtractedTextPath(filePath: string) {
  return `${filePath}.extracted.md`;
}

function renderAttachmentExtract(
  manifest: UploadManifest,
  originalName: string,
): string {
  const lines: string[] = [
    `# Extracted attachment text`,
    ``,
    `- source: ${originalName}`,
    `- kind: ${manifest.kind.toUpperCase()}`,
    `- page_count: ${manifest.page_count}`,
    `- brand_name: ${manifest.brand_name ?? "unknown"}`,
  ];

  if (manifest.notes.length > 0) {
    lines.push(`- notes: ${manifest.notes.slice(0, 3).join(" | ")}`);
  }

  for (const page of manifest.pages) {
    lines.push("");
    lines.push(`## Page ${page.index}: ${page.title || `${manifest.kind.toUpperCase()} page ${page.index}`}`);
    if (page.summary) {
      lines.push("");
      lines.push(`Summary: ${page.summary}`);
    }
    if (page.text_excerpt) {
      lines.push("");
      lines.push("```text");
      lines.push(page.text_excerpt);
      lines.push("```");
    }
  }

  if (manifest.pages.length === 0) {
    lines.push("");
    lines.push("_No structured page text was extracted from this attachment._");
  }

  return lines.join("\n");
}
