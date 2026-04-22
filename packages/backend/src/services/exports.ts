import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { ExportFormat } from "@bg/shared";
import { createExportJob, getExportJob, updateExportJob } from "../db/exports";
import { getProjectDetail } from "../db/seed";
import { exportsDir } from "../lib/paths";

export async function enqueueProjectExport(projectId: string, format: ExportFormat) {
  const job = await createExportJob(projectId, format);
  if (!job) {
    throw new Error("export_create_failed");
  }

  void runExport(job.id);
  return job;
}

async function runExport(jobId: string) {
  const job = await getExportJob(jobId);
  if (!job) {
    return;
  }

  const project = await getProjectDetail(job.project_id);
  if (!project) {
    await updateExportJob(jobId, {
      status: "failed",
      errorMessage: "Project not found",
      completedAt: Date.now(),
    });
    return;
  }

  if (job.format !== "html_zip") {
    await updateExportJob(jobId, {
      status: "failed",
      errorMessage: `Unsupported export format: ${job.format}`,
      completedAt: Date.now(),
    });
    return;
  }

  try {
    await updateExportJob(jobId, { status: "running" });
    await mkdir(exportsDir, { recursive: true });
    const outputPath = path.join(exportsDir, `${project.id}-${job.id}.zip`);
    await rm(outputPath, { force: true });

    const sourceWildcard = path.join(project.dir_path, "*");
    const command = [
      "powershell",
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${escapeForPs(sourceWildcard)}' -DestinationPath '${escapeForPs(outputPath)}' -Force`,
    ];

    const proc = Bun.spawn(command, {
      stdout: "ignore",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const errorText = await new Response(proc.stderr).text();
      throw new Error(errorText || `Compress-Archive failed with exit code ${exitCode}`);
    }

    const info = await stat(outputPath);
    await updateExportJob(jobId, {
      status: "succeeded",
      outputPath,
      sizeBytes: info.size,
      completedAt: Date.now(),
    });
  } catch (error) {
    await updateExportJob(jobId, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
      completedAt: Date.now(),
    });
  }
}

function escapeForPs(value: string) {
  return value.replaceAll("'", "''");
}

