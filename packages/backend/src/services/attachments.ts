import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ulid } from "ulid";
import { insertAttachment } from "../db/attachments";
import { getSessionProject } from "../db/events";

export async function saveSessionAttachments(sessionId: string, files: File[]) {
  const context = await getSessionProject(sessionId);
  if (!context) {
    throw new Error("session_not_found");
  }

  const attachmentsDir = path.join(context.project_dir, ".attachments");
  await mkdir(attachmentsDir, { recursive: true });

  const records: string[] = [];

  for (const file of files) {
    const base = sanitize(file.name || "attachment");
    const storedName = `${ulid()}-${base}`;
    const absolutePath = path.join(attachmentsDir, storedName);
    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");

    await writeFile(absolutePath, buffer);
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

