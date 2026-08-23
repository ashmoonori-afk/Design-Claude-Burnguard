import { ulid } from "ulid";
import { getSqlite } from "./sqlite-client";

export type AttachmentContext = {
  readonly session_id: string;
  readonly project_id: string;
  readonly project_dir: string;
};

export type AttachmentRecordInput = {
  readonly sessionId: string; readonly filePath: string; readonly mimeType: string;
  readonly originalName: string; readonly sizeBytes: number; readonly sha256: string;
};

export function insertAttachmentRecord(input: AttachmentRecordInput): void {
  getSqlite().prepare(`INSERT INTO attachments(id,session_id,file_path,mime_type,original_name,size_bytes,sha256,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(ulid(), input.sessionId, input.filePath, input.mimeType, input.originalName, input.sizeBytes, input.sha256, Date.now());
}

export function getAttachmentContext(sessionId: string): AttachmentContext | null {
  return getSqlite().query<AttachmentContext, [string]>(`SELECT s.id session_id,p.id project_id,p.dir_path project_dir
    FROM sessions s JOIN projects p ON p.id=s.project_id WHERE s.id=?`).get(sessionId);
}
