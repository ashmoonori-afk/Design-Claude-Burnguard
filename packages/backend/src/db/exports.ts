import { desc, eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { ExportFormat, ExportJob, ExportStatus } from "@bg/shared";
import { getDb } from "./client";
import { exportsTable } from "./schema";

export async function createExportJob(projectId: string, format: ExportFormat) {
  const db = getDb();
  const id = ulid();
  const createdAt = Date.now();

  await db.insert(exportsTable).values({
    id,
    projectId,
    format,
    status: "pending",
    createdAt,
  });

  return getExportJob(id);
}

export async function updateExportJob(
  id: string,
  patch: {
    status: ExportStatus;
    outputPath?: string | null;
    errorMessage?: string | null;
    sizeBytes?: number | null;
    completedAt?: number | null;
  },
) {
  const db = getDb();
  await db
    .update(exportsTable)
    .set({
      status: patch.status,
      outputPath: patch.outputPath,
      errorMessage: patch.errorMessage,
      sizeBytes: patch.sizeBytes,
      completedAt: patch.completedAt,
    })
    .where(eq(exportsTable.id, id));

  return getExportJob(id);
}

export async function getExportJob(id: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: exportsTable.id,
      project_id: exportsTable.projectId,
      format: exportsTable.format,
      status: exportsTable.status,
      output_path: exportsTable.outputPath,
      error_message: exportsTable.errorMessage,
      size_bytes: exportsTable.sizeBytes,
      created_at: exportsTable.createdAt,
      completed_at: exportsTable.completedAt,
    })
    .from(exportsTable)
    .where(eq(exportsTable.id, id))
    .limit(1);

  return (rows[0] ?? null) as ExportJob | null;
}

export async function listProjectExports(projectId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: exportsTable.id,
      project_id: exportsTable.projectId,
      format: exportsTable.format,
      status: exportsTable.status,
      output_path: exportsTable.outputPath,
      error_message: exportsTable.errorMessage,
      size_bytes: exportsTable.sizeBytes,
      created_at: exportsTable.createdAt,
      completed_at: exportsTable.completedAt,
    })
    .from(exportsTable)
    .where(eq(exportsTable.projectId, projectId))
    .orderBy(desc(exportsTable.createdAt));

  return rows as ExportJob[];
}

