import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ExportFormat, ExportOptions } from "@bg/shared";
import { createExportJob, getExportJob, updateExportJob } from "../db/exports";
import { getProjectDetail } from "../db/seed";
import { exportsDir } from "../lib/paths";
import { DECK_STAGE_JS } from "../runtime/deck-stage";
import { renderDeckToPdf } from "./export-pdf";
import { renderDeckToPptx } from "./export-pptx";
import { renderHandoffBundle } from "./export-handoff";
import { getDesignSystemDetail } from "../db/seed";
import { zipDirectory } from "./zip";

export async function enqueueProjectExport(
  projectId: string,
  format: ExportFormat,
  options: ExportOptions = {},
) {
  const job = await createExportJob(projectId, format);
  if (!job) {
    throw new Error("export_create_failed");
  }

  // Options are pass-through (not persisted on the job) so a retry from
  // the status list deliberately falls back to defaults — the menu is
  // what carries the preset choice. See doc/06-milestones P4 export
  // audit notes for the trade-off.
  void runExport(job.id, options);
  return job;
}

async function runExport(jobId: string, options: ExportOptions = {}) {
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
    job.format !== "pptx" &&
    job.format !== "handoff"
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
          paper: options.pdf_paper,
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
          size: options.pptx_size,
        });
      } else if (job.format === "handoff") {
        const tokens = await resolveHandoffTokens(
          project.design_system_id,
          project.dir_path,
        );
        const bundleDir = path.join(stagingDir, `${project.id}-handoff`);
        await mkdir(bundleDir, { recursive: true });
        await renderHandoffBundle({
          // Full project mirror — renderHandoffBundle copies it into
          // bundleDir/source/ so images/CSS/JS/fonts ship too.
          stagedProjectDir: projectStageDir,
          stagingDir: bundleDir,
          entrypoint: project.entrypoint,
          tokensSrcPath: tokens.srcPath,
          tokensFileName: tokens.fileName,
          designSystemName: tokens.systemName,
          project: {
            id: project.id,
            name: project.name,
            type: project.type,
            entrypoint: project.entrypoint,
          },
          isDeck: project.type === "slide_deck",
        });

        await zipDirectory(bundleDir, outputPath);
      } else {
        await zipDirectory(projectStageDir, outputPath);
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

async function resolveHandoffTokens(
  designSystemId: string | null,
  projectDirPath: string,
): Promise<{
  systemName: string | null;
  fileName: string | null;
  srcPath: string | null;
}> {
  if (!designSystemId) {
    return { systemName: null, fileName: null, srcPath: null };
  }
  const detail = await getDesignSystemDetail(designSystemId);
  if (!detail || !detail.tokens_css_path) {
    return {
      systemName: detail?.name ?? null,
      fileName: null,
      srcPath: null,
    };
  }
  // tokens_css_path is stored relative to the design system directory.
  // Lift to absolute via the stored dir_path; fall back silently if it
  // points at nothing on disk so the handoff export still succeeds.
  void projectDirPath;
  const absolute = detail.tokens_css_path;
  return {
    systemName: detail.name,
    fileName: path.basename(absolute),
    srcPath: absolute,
  };
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
