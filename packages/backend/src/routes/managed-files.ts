import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import type { ApiErrorBody, ApiSuccess } from "@bg/shared";
import { getManagedExportJob } from "../db/managed-file-repository";
import { getProjectDetail } from "../db/project-read-repository";
import { exportsDir, resolveManagedPath } from "../lib/paths";
import { resolveDrawFile, resolveProjectFile } from "../services/managed-project-files";

function ok<T>(data: T): ApiSuccess<T> { return { data }; }
function fail(code: string, message: string, details?: unknown): ApiErrorBody { return { error: { code, message, details } }; }

export const managedFileRoutes = new Hono();

managedFileRoutes.get("/api/projects/:id/fs/*", async (c) => {
  const projectId = c.req.param("id");
  const prefix = `/api/projects/${projectId}/fs/`;
  const relPath = c.req.path.startsWith(prefix) ? decodeURIComponent(c.req.path.slice(prefix.length)) : "";
  const resolved = await resolveProjectFile(projectId, relPath);
  if (resolved === null) return c.json(fail("file_not_found", "Project file not found", { projectId, relPath }), 404);
  try {
    if (!(await stat(resolved.absolutePath)).isFile()) return c.json(fail("not_a_file", "Requested path is not a file", { relPath }), 400);
  } catch (error) {
    if (error instanceof Error) return c.json(fail("file_not_found", "Project file not found", { projectId, relPath }), 404);
    throw error;
  }
  return new Response(Bun.file(resolved.absolutePath), { headers: { "Cache-Control": "no-cache", "Content-Type": contentType(resolved.absolutePath) } });
});

managedFileRoutes.get("/api/projects/:id/draws/*", async (c) => {
  const projectId = c.req.param("id");
  const prefix = `/api/projects/${projectId}/draws/`;
  const relPath = c.req.path.startsWith(prefix) ? decodeURIComponent(c.req.path.slice(prefix.length)) : "";
  if (relPath.length === 0) return c.json(fail("invalid_path", "File path is required"), 400);
  const resolved = await resolveDrawFile(projectId, relPath);
  if (resolved === null) return c.json(fail("project_not_found", "Project or path invalid", { projectId, relPath }), 404);
  try {
    if (!(await stat(resolved.absolutePath)).isFile()) return c.json(fail("not_a_file", "Draws sidecar is not a file", { relPath }), 400);
    return c.body(await readFile(resolved.absolutePath, "utf8"), 200, { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-cache" });
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return c.body('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 200, { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-cache" });
  }
});

managedFileRoutes.put("/api/projects/:id/draws/*", async (c) => {
  const projectId = c.req.param("id");
  if (await getProjectDetail(projectId) === null) return c.json(fail("project_not_found", "Project not found", { projectId }), 404);
  const prefix = `/api/projects/${projectId}/draws/`;
  const relPath = c.req.path.startsWith(prefix) ? decodeURIComponent(c.req.path.slice(prefix.length)) : "";
  if (relPath.length === 0) return c.json(fail("invalid_path", "File path is required"), 400);
  const resolved = await resolveDrawFile(projectId, relPath);
  if (resolved === null) return c.json(fail("path_escape", "Resolved path escapes the draws root", { relPath }), 400);
  const body = await c.req.text();
  if (body.length > 2_000_000) return c.json(fail("invalid_body", "svg body required (string, <= 2MB)"), 400);
  await mkdir(resolved.parentDir, { recursive: true });
  await writeFile(resolved.absolutePath, body, "utf8");
  return c.json(ok({ rel_path: resolved.relPath, bytes: body.length }));
});

managedFileRoutes.get("/api/exports/:id/download", async (c) => {
  const id = c.req.param("id");
  const job = getManagedExportJob(id);
  if (job === null) return c.json(fail("export_not_found", "Export job not found", { id }), 404);
  if (job.status !== "succeeded" || job.output_path === null) return c.json(fail("export_not_ready", "Export is not ready for download", { id }), 409);
  let outputPath: string;
  try {
    outputPath = resolveManagedPath(exportsDir, job.output_path);
    if (!(await stat(outputPath)).isFile()) return c.json(fail("export_not_found", "Export output file not found", { id }), 404);
  } catch (error) {
    if (error instanceof Error) return c.json(fail("export_not_found", "Export output file not found", { id }), 404);
    throw error;
  }
  const project = await getProjectDetail(job.project_id);
  const { buildContentDisposition, buildDownloadFilename, formatMime } = await import("../services/export-naming");
  const filename = buildDownloadFilename({ projectName: project?.name ?? null, job });
  return new Response(Bun.file(outputPath), { headers: { "Content-Disposition": buildContentDisposition(filename), "Content-Type": formatMime(job.format) } });
});

function contentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html": case ".htm": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js": case ".mjs": case ".cjs": return "application/javascript; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    case ".md": case ".txt": return "text/plain; charset=utf-8";
    default: return "application/octet-stream";
  }
}
