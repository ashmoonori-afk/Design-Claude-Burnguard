import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import type {
  ApiErrorBody,
  ApiSuccess,
  ArtifactSummary,
  ExportFormat,
  ExportJob,
  FileInfo,
  PatchFileResponse,
} from "@bg/shared";
import { buildArtifactSummary, indexProjectFiles, listIndexedProjectFiles, resolveDrawFile, resolveProjectFile } from "../services/files";
import { enqueueProjectExport } from "../services/exports";
import {
  buildContentDisposition,
  buildDownloadFilename,
  formatMime,
} from "../services/export-naming";
import { noteEmittedFileChange } from "../services/file-change-broker";
import { FilePatchError, patchHtmlNode } from "../services/file-patch";
import { getExportJob, listProjectExports } from "../db/exports";
import { getProjectDetail } from "../db/seed";

function ok<T>(data: T): ApiSuccess<T> {
  return { data };
}

function fail(
  code: string,
  message: string,
  details?: unknown,
): ApiErrorBody {
  return { error: { code, message, details } };
}

function isExportFormat(value: unknown): value is ExportFormat {
  return value === "html_zip" || value === "pdf" || value === "pptx" || value === "handoff";
}

export const artifactRoutes = new Hono();

artifactRoutes.get("/api/projects/:id/files", async (c) => {
  const projectId = c.req.param("id");
  const project = await getProjectDetail(projectId);
  if (!project) {
    return c.json(fail("project_not_found", "Project not found", { projectId }), 404);
  }

  const files = await listIndexedProjectFiles(projectId);
  return c.json(ok(files satisfies FileInfo[]));
});

artifactRoutes.get("/api/projects/:id/artifacts", async (c) => {
  const projectId = c.req.param("id");
  const artifacts = await buildArtifactSummary(projectId);
  if (!artifacts) {
    return c.json(fail("project_not_found", "Project not found", { projectId }), 404);
  }

  return c.json(ok(artifacts satisfies ArtifactSummary));
});

artifactRoutes.post("/api/projects/:id/refresh", async (c) => {
  const projectId = c.req.param("id");
  const project = await getProjectDetail(projectId);
  if (!project) {
    return c.json(fail("project_not_found", "Project not found", { projectId }), 404);
  }

  await indexProjectFiles(projectId);
  const artifacts = await buildArtifactSummary(projectId);
  if (!artifacts) {
    return c.json(fail("project_not_found", "Project not found", { projectId }), 404);
  }
  return c.json(ok(artifacts satisfies ArtifactSummary));
});

artifactRoutes.get("/api/projects/:id/fs/*", async (c) => {
  const projectId = c.req.param("id");
  // Hono 4.x does not expose the wildcard match via c.req.param("*") for a
  // bare `/*` pattern — that always returns empty. Parse the tail manually
  // from the request path so `/api/projects/:id/fs/foo/bar.html` yields
  // relPath=`foo/bar.html`.
  const prefix = `/api/projects/${projectId}/fs/`;
  const rawPath = c.req.path;
  const relPath = rawPath.startsWith(prefix)
    ? decodeURIComponent(rawPath.slice(prefix.length))
    : "";
  const resolved = await resolveProjectFile(projectId, relPath);
  if (!resolved) {
    // eslint-disable-next-line no-console
    console.log(`[fs] 404 resolve failed: projectId=${projectId} relPath=${JSON.stringify(relPath)}`);
    return c.json(fail("file_not_found", "Project file not found", { projectId, relPath }), 404);
  }

  try {
    const info = await stat(resolved.absolutePath);
    if (!info.isFile()) {
      // eslint-disable-next-line no-console
      console.log(`[fs] 400 not-a-file: ${resolved.absolutePath}`);
      return c.json(fail("not_a_file", "Requested path is not a file", { relPath }), 400);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`[fs] 404 stat failed: ${resolved.absolutePath} err=${err instanceof Error ? err.message : String(err)}`);
    return c.json(fail("file_not_found", "Project file not found", { projectId, relPath }), 404);
  }

  // eslint-disable-next-line no-console
  console.log(`[fs] 200 serving: ${resolved.absolutePath}`);

  const contentType = detectContentType(resolved.absolutePath);
  c.header("Cache-Control", "no-cache");
  c.header("Content-Type", contentType);
  return new Response(Bun.file(resolved.absolutePath), {
    headers: c.res.headers,
  });
});

artifactRoutes.patch("/api/projects/:id/fs/*", async (c) => {
  const projectId = c.req.param("id");
  const project = await getProjectDetail(projectId);
  if (!project) {
    return c.json(fail("project_not_found", "Project not found", { projectId }), 404);
  }

  const prefix = `/api/projects/${projectId}/fs/`;
  const rawPath = c.req.path;
  const relPath = rawPath.startsWith(prefix)
    ? decodeURIComponent(rawPath.slice(prefix.length))
    : "";
  if (!relPath) {
    return c.json(fail("invalid_path", "File path is required"), 400);
  }

  const body = await c.req.json<unknown>().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json(fail("invalid_body", "Expected a JSON object"), 400);
  }
  const { node_bg_id, text, attributes, styles } = body as Record<string, unknown>;
  if (typeof node_bg_id !== "string" || !node_bg_id.trim()) {
    return c.json(
      fail("invalid_node_bg_id", "node_bg_id is required", { node_bg_id }),
      400,
    );
  }
  if (text !== undefined && typeof text !== "string") {
    return c.json(fail("invalid_text", "text must be a string"), 400);
  }
  let validatedAttributes: Record<string, string | null> | undefined;
  if (attributes !== undefined) {
    if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
      return c.json(fail("invalid_attributes", "attributes must be an object"), 400);
    }
    const entries: Array<[string, string | null]> = [];
    for (const [name, value] of Object.entries(attributes)) {
      if (value !== null && typeof value !== "string") {
        return c.json(
          fail("invalid_attr_value", `attributes.${name} must be string or null`),
          400,
        );
      }
      entries.push([name, value]);
    }
    validatedAttributes = Object.fromEntries(entries);
  }
  let validatedStyles: Record<string, string | null> | undefined;
  if (styles !== undefined) {
    if (!styles || typeof styles !== "object" || Array.isArray(styles)) {
      return c.json(fail("invalid_styles", "styles must be an object"), 400);
    }
    const entries: Array<[string, string | null]> = [];
    for (const [name, value] of Object.entries(styles)) {
      if (value !== null && typeof value !== "string") {
        return c.json(
          fail("invalid_style_value", `styles.${name} must be string or null`),
          400,
        );
      }
      entries.push([name, value]);
    }
    validatedStyles = Object.fromEntries(entries);
  }

  try {
    const result = await patchHtmlNode(projectId, relPath, {
      node_bg_id,
      text,
      attributes: validatedAttributes,
      styles: validatedStyles,
    });
    // Record our own write before the fs watcher catches it (~120ms
    // debounce later). Without this note, every Tweaks / Edit PATCH
    // produces a duplicate `file.changed` event in chat because the
    // watcher path treats our disk write as an external edit.
    noteEmittedFileChange(projectId, relPath);
    await indexProjectFiles(projectId);
    return c.json(
      ok({
        rel_path: relPath,
        node_bg_id,
        updated_at: result.updatedAt,
      } satisfies PatchFileResponse),
    );
  } catch (err) {
    if (err instanceof FilePatchError) {
      const status =
        err.code === "file_not_found" || err.code === "node_not_found" ? 404 : 400;
      return c.json(fail(err.code, err.message), status);
    }
    throw err;
  }
});

/**
 * Draw mode (P3.2) annotations are stored per-file under
 * `<project>/.meta/draws/<rel_path>.svg`. GET returns the saved svg
 * (or 404 if the user hasn't drawn yet). PUT overwrites with the new
 * svg; body is a plain string.
 */
artifactRoutes.get("/api/projects/:id/draws/*", async (c) => {
  const projectId = c.req.param("id");
  const prefix = `/api/projects/${projectId}/draws/`;
  const rawPath = c.req.path;
  const relPath = rawPath.startsWith(prefix)
    ? decodeURIComponent(rawPath.slice(prefix.length))
    : "";
  if (!relPath) {
    return c.json(fail("invalid_path", "File path is required"), 400);
  }
  const resolved = await resolveDrawFile(projectId, relPath);
  if (!resolved) {
    return c.json(fail("project_not_found", "Project or path invalid", { projectId, relPath }), 404);
  }

  try {
    const info = await stat(resolved.absolutePath);
    if (!info.isFile()) {
      return c.json(fail("not_a_file", "Draws sidecar is not a file", { relPath }), 400);
    }
  } catch {
    // No saved draws yet — return an empty svg so the client doesn't
    // have to special-case 404.
    c.header("Content-Type", "image/svg+xml; charset=utf-8");
    c.header("Cache-Control", "no-cache");
    return c.body('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 200);
  }

  const body = await readFile(resolved.absolutePath, "utf8");
  c.header("Content-Type", "image/svg+xml; charset=utf-8");
  c.header("Cache-Control", "no-cache");
  return c.body(body, 200);
});

artifactRoutes.put("/api/projects/:id/draws/*", async (c) => {
  const projectId = c.req.param("id");
  const project = await getProjectDetail(projectId);
  if (!project) {
    return c.json(fail("project_not_found", "Project not found", { projectId }), 404);
  }

  const prefix = `/api/projects/${projectId}/draws/`;
  const rawPath = c.req.path;
  const relPath = rawPath.startsWith(prefix)
    ? decodeURIComponent(rawPath.slice(prefix.length))
    : "";
  if (!relPath) {
    return c.json(fail("invalid_path", "File path is required"), 400);
  }

  const resolved = await resolveDrawFile(projectId, relPath);
  if (!resolved) {
    return c.json(fail("path_escape", "Resolved path escapes the draws root", { relPath }), 400);
  }

  const body = await c.req.text();
  if (typeof body !== "string" || body.length > 2_000_000) {
    return c.json(fail("invalid_body", "svg body required (string, <= 2MB)"), 400);
  }

  await mkdir(resolved.parentDir, { recursive: true });
  await writeFile(resolved.absolutePath, body, "utf8");
  return c.json(ok({ rel_path: resolved.relPath, bytes: body.length }));
});

artifactRoutes.get("/api/projects/:id/exports", async (c) => {
  const projectId = c.req.param("id");
  const project = await getProjectDetail(projectId);
  if (!project) {
    return c.json(fail("project_not_found", "Project not found", { projectId }), 404);
  }

  const jobs = await listProjectExports(projectId);
  return c.json(ok(jobs satisfies ExportJob[]));
});

artifactRoutes.post("/api/projects/:id/exports", async (c) => {
  const projectId = c.req.param("id");
  const project = await getProjectDetail(projectId);
  if (!project) {
    return c.json(fail("project_not_found", "Project not found", { projectId }), 404);
  }

  const body = await c.req.json<unknown>().catch(() => null);
  const format = body && typeof body === "object" && "format" in body ? body.format : undefined;
  if (!isExportFormat(format)) {
    return c.json(fail("invalid_export_format", "Unsupported export format", { format }), 400);
  }
  if (
    format !== "html_zip" &&
    format !== "pdf" &&
    format !== "pptx" &&
    format !== "handoff"
  ) {
    return c.json(
      fail("export_not_implemented", `Export format is not implemented yet: ${format}`, {
        format,
      }),
      501,
    );
  }
  if ((format === "pdf" || format === "pptx") && project.type !== "slide_deck") {
    return c.json(
      fail(
        "format_requires_deck",
        `${format.toUpperCase()} export is only available for slide_deck projects`,
        { projectType: project.type },
      ),
      400,
    );
  }

  const job = await enqueueProjectExport(projectId, format);
  return c.json(ok(job satisfies ExportJob), 202);
});

artifactRoutes.get("/api/exports/:id", async (c) => {
  const id = c.req.param("id");
  const job = await getExportJob(id);
  if (!job) {
    return c.json(fail("export_not_found", "Export job not found", { id }), 404);
  }

  return c.json(ok(job satisfies ExportJob));
});

artifactRoutes.get("/api/exports/:id/download", async (c) => {
  const id = c.req.param("id");
  const job = await getExportJob(id);
  if (!job) {
    return c.json(fail("export_not_found", "Export job not found", { id }), 404);
  }
  if (job.status !== "succeeded" || !job.output_path) {
    return c.json(fail("export_not_ready", "Export is not ready for download", { id }), 409);
  }

  // Friendly user-facing filename (project-slug-format-date.ext) and
  // the correct MIME type per format. Both fixes from the export audit:
  // the previous response always claimed application/zip, even for PDF
  // / PPTX, and the filename was the internal ulid-based staging name.
  const project = await getProjectDetail(job.project_id);
  const filename = buildDownloadFilename({
    projectName: project?.name ?? null,
    job,
  });
  c.header("Content-Disposition", buildContentDisposition(filename));
  c.header("Content-Type", formatMime(job.format));
  return new Response(Bun.file(job.output_path), {
    headers: c.res.headers,
  });
});

function detectContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
    case ".htm":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".md":
    case ".txt":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
