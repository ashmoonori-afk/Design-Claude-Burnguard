import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { FileInfo } from "@bg/shared";
import { getDb } from "./client";
import { filesTable } from "./schema";

export async function replaceProjectFiles(projectId: string, files: FileInfo[]) {
  const db = getDb();
  await db.delete(filesTable).where(eq(filesTable.projectId, projectId));

  if (files.length === 0) {
    return;
  }

  await db.insert(filesTable).values(
    files.map((file) => ({
      id: ulid(),
      projectId,
      relPath: file.rel_path,
      category: file.category,
      sizeBytes: file.size_bytes ?? null,
      updatedAt: file.updated_at ?? Date.now(),
    })),
  );
}

export async function listProjectFiles(projectId: string) {
  const db = getDb();
  const rows = await db
    .select({
      rel_path: filesTable.relPath,
      category: filesTable.category,
      size_bytes: filesTable.sizeBytes,
      updated_at: filesTable.updatedAt,
    })
    .from(filesTable)
    .where(eq(filesTable.projectId, projectId))
    .orderBy(filesTable.relPath);

  return rows satisfies FileInfo[];
}

export async function getProjectFile(projectId: string, relPath: string) {
  const db = getDb();
  const rows = await db
    .select({
      rel_path: filesTable.relPath,
      category: filesTable.category,
      size_bytes: filesTable.sizeBytes,
      updated_at: filesTable.updatedAt,
    })
    .from(filesTable)
    .where(and(eq(filesTable.projectId, projectId), eq(filesTable.relPath, relPath)))
    .limit(1);

  return (rows[0] ?? null) as FileInfo | null;
}

