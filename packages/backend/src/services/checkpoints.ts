import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CheckpointRef } from "@bg/shared";
import { getProjectDetail } from "../db/seed";
import { listIndexedProjectFiles } from "./files";

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

