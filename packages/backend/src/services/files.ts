import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { ArtifactSummary, FileInfo } from "@bg/shared";
import { listProjectFiles as listProjectFilesFromDb, replaceProjectFiles } from "../db/files";
import { getProjectDetail } from "../db/seed";

const IGNORED_DIRS = new Set([".attachments", ".meta", ".git"]);

export async function indexProjectFiles(projectId: string) {
  const project = await getProjectDetail(projectId);
  if (!project) {
    return null;
  }

  const files = await scanProjectDir(project.dir_path);
  await replaceProjectFiles(projectId, files);
  return files;
}

export async function listIndexedProjectFiles(projectId: string) {
  const project = await getProjectDetail(projectId);
  if (!project) {
    return [];
  }

  const files = await listProjectFilesFromDb(projectId);
  if (files.length > 0) {
    return files;
  }

  return (await indexProjectFiles(projectId)) ?? [];
}

export async function buildArtifactSummary(projectId: string): Promise<ArtifactSummary | null> {
  const project = await getProjectDetail(projectId);
  if (!project) {
    return null;
  }

  const files = await listIndexedProjectFiles(projectId);
  const latestUpdated = files.reduce(
    (max, file) => Math.max(max, file.updated_at ?? 0),
    project.updated_at,
  );

  return {
    project_id: project.id,
    entrypoint: project.entrypoint,
    entrypoint_url: `/api/projects/${project.id}/fs/${project.entrypoint}`,
    design_system_id: project.design_system_id,
    design_system_url: project.design_system_id
      ? `/api/design-systems/${project.design_system_id}`
      : null,
    file_count: files.length,
    updated_at: latestUpdated,
  };
}

export async function resolveProjectFile(projectId: string, relPath: string) {
  const project = await getProjectDetail(projectId);
  if (!project) {
    return null;
  }

  const normalized = normalizeRelativePath(relPath);
  if (!normalized) {
    return null;
  }

  const absolute = path.resolve(project.dir_path, normalized);
  const root = path.resolve(project.dir_path);
  if (!absolute.startsWith(root)) {
    return null;
  }

  return {
    project,
    relPath: normalized,
    absolutePath: absolute,
  };
}

async function scanProjectDir(projectDir: string) {
  const output: FileInfo[] = [];
  await walk(projectDir, projectDir, output);
  return output.sort((a, b) => a.rel_path.localeCompare(b.rel_path));
}

async function walk(rootDir: string, currentDir: string, output: FileInfo[]) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const absolute = path.join(currentDir, entry.name);
    const relPath = path.relative(rootDir, absolute).replaceAll("\\", "/");
    const stats = await stat(absolute);

    if (entry.isDirectory()) {
      output.push({
        rel_path: relPath,
        category: "folder",
        size_bytes: null,
        updated_at: stats.mtimeMs,
      });
      await walk(rootDir, absolute, output);
      continue;
    }

    output.push({
      rel_path: relPath,
      category: categorize(relPath),
      size_bytes: stats.size,
      updated_at: stats.mtimeMs,
    });
  }
}

function categorize(relPath: string): FileInfo["category"] {
  const ext = path.extname(relPath).toLowerCase();
  switch (ext) {
    case ".html":
    case ".htm":
      return "html";
    case ".css":
      return "stylesheet";
    case ".js":
    case ".mjs":
    case ".cjs":
    case ".ts":
    case ".tsx":
      return "script";
    case ".md":
    case ".txt":
    case ".json":
      return "document";
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".gif":
    case ".svg":
    case ".webp":
      return "asset";
    default:
      return "other";
  }
}

function normalizeRelativePath(relPath: string) {
  const normalized = relPath.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    return null;
  }
  return normalized;
}

