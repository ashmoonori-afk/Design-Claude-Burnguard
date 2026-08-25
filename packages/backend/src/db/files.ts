import { ulid } from "ulid";
import type { FileInfo } from "@bg/shared/harness";
import { getSqlite } from "./sqlite-client";

export async function replaceProjectFiles(projectId: string, files: readonly FileInfo[]): Promise<void> {
  const db = getSqlite();
  db.transaction(() => {
    db.prepare("DELETE FROM files WHERE project_id=?").run(projectId);
    const insert = db.prepare("INSERT INTO files(id,project_id,rel_path,category,size_bytes,hash,updated_at) VALUES (?,?,?,?,?,?,?)");
    for (const file of files) insert.run(ulid(), projectId, file.rel_path, file.category, file.size_bytes ?? null, file.hash ?? null, file.updated_at ?? Date.now());
  })();
}

export async function listProjectFiles(projectId: string): Promise<FileInfo[]> {
  return getSqlite().query<FileInfo, [string]>("SELECT rel_path,category,size_bytes,hash,updated_at FROM files WHERE project_id=? ORDER BY rel_path").all(projectId);
}

export async function getProjectFile(projectId: string, relPath: string): Promise<FileInfo | null> {
  return getSqlite().query<FileInfo, [string, string]>("SELECT rel_path,category,size_bytes,hash,updated_at FROM files WHERE project_id=? AND rel_path=? LIMIT 1").get(projectId, relPath);
}
