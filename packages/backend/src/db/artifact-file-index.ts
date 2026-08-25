import type { Database } from "bun:sqlite";
import path from "node:path";
import { ulid } from "ulid";
import type { CanonicalTreeManifest } from "../services/canonical-tree-manifest";

export function replaceArtifactFileIndex(db: Database, projectId: string, manifest: CanonicalTreeManifest): void {
  db.transaction(() => { replaceArtifactFileIndexInTransaction(db, projectId, manifest); })();
}

export function replaceArtifactFileIndexInTransaction(db: Database, projectId: string, manifest: CanonicalTreeManifest): void {
  db.prepare("DELETE FROM files WHERE project_id=?").run(projectId);
  const insert = db.prepare("INSERT INTO files(id,project_id,rel_path,category,size_bytes,hash,updated_at) VALUES (?,?,?,?,?,?,?)");
  const now = Date.now();
  for (const file of manifest.files) insert.run(ulid(), projectId, file.path, category(file.path), file.size, file.sha256, now);
}

function category(relativePath: string): "stylesheet" | "script" | "document" | "asset" | "html" | "other" {
  switch (path.extname(relativePath).toLowerCase()) {
    case ".html": case ".htm": return "html";
    case ".css": return "stylesheet";
    case ".js": case ".mjs": case ".cjs": case ".ts": case ".tsx": return "script";
    case ".md": case ".txt": case ".json": return "document";
    case ".png": case ".jpg": case ".jpeg": case ".gif": case ".svg": case ".webp": return "asset";
    default: return "other";
  }
}
