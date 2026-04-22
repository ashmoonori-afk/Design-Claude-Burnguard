import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ExportFormat } from "@bg/shared";
import { createExportJob, getExportJob, updateExportJob } from "../db/exports";
import { getProjectDetail } from "../db/seed";
import { exportsDir } from "../lib/paths";
import { DECK_STAGE_JS } from "../runtime/deck-stage";
import { renderDeckToPdf } from "./export-pdf";
import { renderDeckToPptx } from "./export-pptx";

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

  if (
    job.format !== "html_zip" &&
    job.format !== "pdf" &&
    job.format !== "pptx"
  ) {
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
    const ext =
      job.format === "pdf" ? "pdf" : job.format === "pptx" ? "pptx" : "zip";
    const outputPath = path.join(exportsDir, `${project.id}-${job.id}.${ext}`);
    await rm(outputPath, { force: true });
    const stagingDir = await mkdtemp(path.join(os.tmpdir(), "burnguard-export-"));

    try {
      const projectStageDir = path.join(stagingDir, project.id);
      await cp(project.dir_path, projectStageDir, { recursive: true });

      if (project.type === "slide_deck") {
        await prepareSlideDeckExport(projectStageDir, project.entrypoint);
      }

      if (job.format === "pdf") {
        if (project.type !== "slide_deck") {
          throw new Error(
            "PDF export is only supported for slide_deck projects",
          );
        }
        await renderDeckToPdf({
          stagedDir: projectStageDir,
          entrypoint: project.entrypoint,
          outputPath,
        });
      } else if (job.format === "pptx") {
        if (project.type !== "slide_deck") {
          throw new Error(
            "PPTX export is only supported for slide_deck projects",
          );
        }
        await renderDeckToPptx({
          stagedDir: projectStageDir,
          entrypoint: project.entrypoint,
          outputPath,
        });
      } else {
        const sourceWildcard = path.join(projectStageDir, "*");
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
      }
    } finally {
      await rm(stagingDir, { recursive: true, force: true });
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

async function prepareSlideDeckExport(projectDir: string, entrypoint: string) {
  const runtimeDir = path.join(projectDir, "runtime");
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(path.join(runtimeDir, "deck-stage.js"), DECK_STAGE_JS, "utf8");

  const entrypointPath = path.join(projectDir, entrypoint);
  const relativeRuntimePath = path
    .relative(path.dirname(entrypointPath), path.join(runtimeDir, "deck-stage.js"))
    .replaceAll("\\", "/");
  const html = await readFile(entrypointPath, "utf8");
  const rewritten = html.replaceAll("/runtime/deck-stage.js", relativeRuntimePath);
  await writeFile(entrypointPath, rewritten, "utf8");
}
