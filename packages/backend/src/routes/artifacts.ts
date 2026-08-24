import { Hono } from "hono";
import type {
  ApiErrorBody,
  ApiSuccess,
  ArtifactSummary,
  ExportFormat,
  ExportJob,
  ExportOptions,
  FileInfo,
} from "@bg/shared";
import { buildArtifactSummary, indexProjectFiles, listIndexedProjectFiles } from "../services/files";
import { getExportJob, listProjectExports } from "../db/exports";
import { getProjectDetail } from "../db/project-read-repository";

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

  // Parse and validate the optional `options` block. Anything unknown
  // is rejected so a typo in the client doesn't silently fall back to
  // defaults — the user thinks they picked Letter, gets A4.
  const optionsRaw =
    body && typeof body === "object" && "options" in body
      ? (body as { options: unknown }).options
      : undefined;
  const options: ExportOptions = {};
  if (optionsRaw !== undefined) {
    if (typeof optionsRaw !== "object" || optionsRaw === null) {
      return c.json(
        fail("invalid_export_options", "options must be an object", { optionsRaw }),
        400,
      );
    }
    const opts = optionsRaw as Record<string, unknown>;
    if (opts.pdf_paper !== undefined) {
      if (
        opts.pdf_paper !== "a4" &&
        opts.pdf_paper !== "letter" &&
        opts.pdf_paper !== "widescreen-16x9"
      ) {
        return c.json(
          fail(
            "invalid_export_options",
            "options.pdf_paper must be one of a4 | letter | widescreen-16x9",
            { value: opts.pdf_paper },
          ),
          400,
        );
      }
      options.pdf_paper = opts.pdf_paper;
    }
    if (opts.pptx_size !== undefined) {
      if (opts.pptx_size !== "16x9" && opts.pptx_size !== "4x3") {
        return c.json(
          fail(
            "invalid_export_options",
            "options.pptx_size must be one of 16x9 | 4x3",
            { value: opts.pptx_size },
          ),
          400,
        );
      }
      options.pptx_size = opts.pptx_size;
    }
  }

  const { enqueueProjectExport } = await import("../services/exports");
  const job = await enqueueProjectExport(projectId, format, options);
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
