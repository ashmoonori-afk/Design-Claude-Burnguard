import { stat } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import type {
  ApiErrorBody,
  ApiSuccess,
  ArtifactSummary,
  ExportFormat,
  ExportJob,
  FileInfo,
} from "@bg/shared";
import { buildArtifactSummary, indexProjectFiles, listIndexedProjectFiles, resolveProjectFile } from "../services/files";
import { enqueueProjectExport } from "../services/exports";
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
  if (format !== "html_zip") {
    return c.json(
      fail("export_not_implemented", `Export format is not implemented yet: ${format}`, {
        format,
      }),
      501,
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

  c.header(
    "Content-Disposition",
    `attachment; filename="${path.basename(job.output_path)}"`,
  );
  c.header("Content-Type", "application/zip");
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
