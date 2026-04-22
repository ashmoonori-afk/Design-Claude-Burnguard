import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { ArtifactSummary, FileInfo } from "@bg/shared";
import { listProjectFiles as listProjectFilesFromDb, replaceProjectFiles } from "../db/files";
import { getProjectDetail } from "../db/seed";

const IGNORED_DIRS = new Set([
  ".attachments",
  ".meta",
  ".git",
  // Artifacts from the user's global Claude Code hooks (oh-my-claudecode).
  // These appear inside the project dir but are not authored by the agent
  // and shouldn't clutter the file tree or the canvas.
  ".omc",
  ".claude",
]);

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

  // Pick the actual file to render in the canvas:
  //   1. `project.entrypoint` if set AND it exists in the indexed files
  //   2. otherwise first HTML file we can find
  //   3. otherwise null (frontend will show the placeholder iframe)
  // Emitting a URL like `/fs/` with no path causes the `relPath: ""` 404 loop.
  const entrypoint = pickEntrypoint(project.entrypoint, files);
  const entrypoint_url = entrypoint
    ? `/api/projects/${project.id}/fs/${entrypoint}`
    : null;

  return {
    project_id: project.id,
    entrypoint: entrypoint ?? project.entrypoint,
    entrypoint_url,
    design_system_id: project.design_system_id,
    design_system_url: project.design_system_id
      ? `/api/design-systems/${project.design_system_id}`
      : null,
    file_count: files.length,
    updated_at: latestUpdated,
  };
}

function pickEntrypoint(
  preferred: string | undefined | null,
  files: FileInfo[],
): string | null {
  const preferredTrimmed = typeof preferred === "string" ? preferred.trim() : "";
  if (preferredTrimmed) {
    const match = files.find(
      (f) => f.rel_path === preferredTrimmed && f.category !== "folder",
    );
    if (match) return preferredTrimmed;
  }
  const html = files.find((f) => f.category === "html");
  return html?.rel_path ?? null;
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

/**
 * Maps a project-relative file path to its draws sidecar under
 * `<project>/.meta/draws/<rel_path>.svg`. Draws are the Draw mode
 * (P3.2) annotation layer — kept under `.meta` so the exporter and
 * the file watcher skip them (`.meta` is in `IGNORED_DIRS`). Returns
 * both the absolute svg path and the parent dir so callers can
 * `mkdir` before writing.
 */
export async function resolveDrawFile(projectId: string, relPath: string) {
  const project = await getProjectDetail(projectId);
  if (!project) {
    return null;
  }

  const normalized = normalizeRelativePath(relPath);
  if (!normalized) {
    return null;
  }

  const drawsRoot = path.resolve(project.dir_path, ".meta", "draws");
  const svgPath = path.resolve(drawsRoot, `${normalized}.svg`);
  if (!svgPath.startsWith(drawsRoot)) {
    return null;
  }

  return {
    project,
    relPath: normalized,
    absolutePath: svgPath,
    parentDir: path.dirname(svgPath),
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

