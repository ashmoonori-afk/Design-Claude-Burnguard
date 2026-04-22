import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CheckpointRef } from "@bg/shared";
import { getProjectDetail } from "../db/seed";
import { listIndexedProjectFiles } from "./files";

const EXCLUDED_DIR_NAMES = new Set([".meta", ".attachments"]);

function snapshotDir(projectDir: string, turnId: string): string {
  return path.join(projectDir, ".meta", "checkpoints", "snapshots", turnId);
}

/**
 * Takes a full-file snapshot of the project directory as it exists
 * right before a turn starts. The snapshot excludes `.meta` and
 * `.attachments` so the checkpoint tree itself and any user uploads
 * don't recurse into every snapshot. Used by the rollback UI (P3.7):
 * restore = copy this snapshot back over the live project.
 */
export async function writePreTurnSnapshot(
  projectId: string,
  turnId: string,
): Promise<CheckpointRef | null> {
  const project = await getProjectDetail(projectId);
  if (!project) return null;

  const dest = snapshotDir(project.dir_path, turnId);
  await mkdir(path.dirname(dest), { recursive: true });
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  const entries = await readdir(project.dir_path, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
    const src = path.join(project.dir_path, entry.name);
    const target = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await cp(src, target, { recursive: true });
    } else if (entry.isFile()) {
      await cp(src, target);
    }
  }

  const createdAt = Date.now();
  return {
    turnId,
    path: dest,
    createdAt,
  };
}

export async function hasSnapshot(
  projectId: string,
  turnId: string,
): Promise<boolean> {
  const project = await getProjectDetail(projectId);
  if (!project) return false;
  const dest = snapshotDir(project.dir_path, turnId);
  try {
    const info = await stat(dest);
    return info.isDirectory();
  } catch {
    return false;
  }
}

export interface RestoreResult {
  turnId: string;
  restoredAt: number;
  removedEntries: string[];
  copiedEntries: string[];
}

/**
 * Restores the project file tree to the pre-turn snapshot for
 * `turnId`. Clears non-`.meta`/`.attachments` entries at the project
 * root, then copies the snapshot tree back. Callers must ensure no
 * turn is running — this function will happily overwrite files under
 * an active CLI subprocess if called concurrently.
 */
export async function restoreFromSnapshot(
  projectId: string,
  turnId: string,
): Promise<RestoreResult | null> {
  const project = await getProjectDetail(projectId);
  if (!project) return null;

  const source = snapshotDir(project.dir_path, turnId);
  try {
    const info = await stat(source);
    if (!info.isDirectory()) return null;
  } catch {
    return null;
  }

  const removed: string[] = [];
  const topLevel = await readdir(project.dir_path, { withFileTypes: true });
  for (const entry of topLevel) {
    if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
    const target = path.join(project.dir_path, entry.name);
    await rm(target, { recursive: true, force: true });
    removed.push(entry.name);
  }

  const copied: string[] = [];
  const snapEntries = await readdir(source, { withFileTypes: true });
  for (const entry of snapEntries) {
    const src = path.join(source, entry.name);
    const dest = path.join(project.dir_path, entry.name);
    if (entry.isDirectory()) {
      await cp(src, dest, { recursive: true });
    } else if (entry.isFile()) {
      await cp(src, dest);
    }
    copied.push(entry.name);
  }

  return {
    turnId,
    restoredAt: Date.now(),
    removedEntries: removed,
    copiedEntries: copied,
  };
}

export async function writeTurnCheckpoint(
  projectId: string,
  turnId: string,
): Promise<CheckpointRef | null> {
  const project = await getProjectDetail(projectId);
  if (!project) {
    return null;
  }

  const files = await listIndexedProjectFiles(projectId);
  const checkpointDir = path.join(project.dir_path, ".meta", "checkpoints");
  const checkpointPath = path.join(checkpointDir, `${turnId}.json`);
  const createdAt = Date.now();

  await mkdir(checkpointDir, { recursive: true });
  await writeFile(
    checkpointPath,
    JSON.stringify(
      {
        turn_id: turnId,
        project_id: projectId,
        entrypoint: project.entrypoint,
        file_count: files.length,
        files,
        created_at: createdAt,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    turnId,
    path: checkpointPath,
    createdAt,
  };
}
