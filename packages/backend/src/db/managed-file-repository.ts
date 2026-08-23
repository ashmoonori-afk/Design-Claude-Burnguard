import { ulid } from "ulid";
import type { ExportJob, FileInfo } from "@bg/shared";
import { getSqlite } from "./sqlite-client";

export function getManagedExportJob(id: string): ExportJob | null {
  return getSqlite().query<ExportJob, [string]>(`SELECT id,project_id,format,status,output_path,error_message,size_bytes,created_at,completed_at
    FROM exports WHERE id=?`).get(id);
}

export function replaceManagedProjectFiles(projectId: string, files: readonly FileInfo[]): void {
  const db = getSqlite();
  db.transaction(() => {
    db.prepare("DELETE FROM files WHERE project_id=?").run(projectId);
    const insert = db.prepare(`INSERT INTO files(id,project_id,rel_path,category,size_bytes,updated_at) VALUES (?,?,?,?,?,?)`);
    for (const file of files) {
      insert.run(ulid(), projectId, file.rel_path, file.category, file.size_bytes ?? null, file.updated_at ?? Date.now());
    }
  })();
}
