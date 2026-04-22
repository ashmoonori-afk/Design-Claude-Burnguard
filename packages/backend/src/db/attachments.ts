import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "./client";
import { attachmentsTable } from "./schema";

export interface AttachmentRecord {
  id: string;
  session_id: string;
  turn_id: string | null;
  file_path: string;
  mime_type: string;
  original_name: string;
  size_bytes: number;
  sha256: string | null;
  created_at: number;
}

export async function insertAttachment(input: {
  sessionId: string;
  turnId?: string | null;
  filePath: string;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
  sha256?: string | null;
}) {
  const db = getDb();
  const id = ulid();
  const createdAt = Date.now();
  await db.insert(attachmentsTable).values({
    id,
    sessionId: input.sessionId,
    turnId: input.turnId ?? null,
    filePath: input.filePath,
    mimeType: input.mimeType,
    originalName: input.originalName,
    sizeBytes: input.sizeBytes,
    sha256: input.sha256 ?? null,
    createdAt,
  });

  return {
    id,
    session_id: input.sessionId,
    turn_id: input.turnId ?? null,
    file_path: input.filePath,
    mime_type: input.mimeType,
    original_name: input.originalName,
    size_bytes: input.sizeBytes,
    sha256: input.sha256 ?? null,
    created_at: createdAt,
  } satisfies AttachmentRecord;
}

export async function listSessionAttachments(sessionId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: attachmentsTable.id,
      session_id: attachmentsTable.sessionId,
      turn_id: attachmentsTable.turnId,
      file_path: attachmentsTable.filePath,
      mime_type: attachmentsTable.mimeType,
      original_name: attachmentsTable.originalName,
      size_bytes: attachmentsTable.sizeBytes,
      sha256: attachmentsTable.sha256,
      created_at: attachmentsTable.createdAt,
    })
    .from(attachmentsTable)
    .where(eq(attachmentsTable.sessionId, sessionId))
    .orderBy(desc(attachmentsTable.createdAt));

  return rows satisfies AttachmentRecord[];
}

export async function assignAttachmentsToTurn(
  sessionId: string,
  filePaths: string[],
  turnId: string,
) {
  if (filePaths.length === 0) {
    return 0;
  }

  const db = getDb();
  const where = and(
    eq(attachmentsTable.sessionId, sessionId),
    isNull(attachmentsTable.turnId),
    inArray(attachmentsTable.filePath, filePaths),
  );
  const rows = await db
    .select({ id: attachmentsTable.id })
    .from(attachmentsTable)
    .where(where);

  if (rows.length === 0) {
    return 0;
  }

  await db.update(attachmentsTable).set({ turnId }).where(where);
  return rows.length;
}
