import { Hono } from "hono";
import type {
  ApiErrorBody,
  ApiSuccess,
  ArtifactSummary,
  ExportFormat,
  ExportJob,
  ExportOptions,
  FileInfo,
  PatchFileResponse,
} from "@bg/shared";
import { buildArtifactSummary, indexProjectFiles, listIndexedProjectFiles } from "../services/files";
import { noteEmittedFileChange } from "../services/file-change-broker";
import {
  FilePatchError,
  getFileUndoState,
  patchHtmlNode,
  undoLastFilePatch,
} from "../services/file-patch";
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

// Hono matches routes in declaration order. Keep the specific undo-info
// route before the generic file route so its suffix is not treated as part
// of the relative file path.
artifactRoutes.get("/api/projects/:id/fs/*/undo-info", async (c) => {
  const projectId = c.req.param("id");
  const project = await getProjectDetail(projectId);
  if (!project) {
    return c.json(
      fail("project_not_found", "Project not found", { projectId }),
      404,
    );
  }
  const prefix = `/api/projects/${projectId}/fs/`;
  const rawPath = c.req.path.replace(/\/undo-info$/, "");
  const relPath = rawPath.startsWith(prefix)
    ? decodeURIComponent(rawPath.slice(prefix.length))
    : "";
  if (!relPath) {
    return c.json(fail("invalid_path", "File path is required"), 400);
  }
  return c.json(ok(getFileUndoState(projectId, relPath)));
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

// Single-step file-level undo for the GUI patch path (audit fix #7).
// POST restores the pre-patch content and clears the entry.
artifactRoutes.post("/api/projects/:id/fs/*/undo", async (c) => {
  const projectId = c.req.param("id");
  const project = await getProjectDetail(projectId);
  if (!project) {
    return c.json(
      fail("project_not_found", "Project not found", { projectId }),
      404,
    );
  }
  const prefix = `/api/projects/${projectId}/fs/`;
  const rawPath = c.req.path.replace(/\/undo$/, "");
  const relPath = rawPath.startsWith(prefix)
    ? decodeURIComponent(rawPath.slice(prefix.length))
    : "";
  if (!relPath) {
    return c.json(fail("invalid_path", "File path is required"), 400);
  }
  const result = await undoLastFilePatch(projectId, relPath);
  if (!result) {
    return c.json(
      fail("no_undo_available", "No prior patch is available to undo", {
        relPath,
      }),
      404,
    );
  }
  // Same dedupe trick as PATCH: tell the file-change broker we wrote
  // this so the watcher does not re-emit a duplicate `file.changed`.
  noteEmittedFileChange(projectId, relPath);
  await indexProjectFiles(projectId);
  return c.json(
    ok({
      rel_path: relPath,
      updated_at: result.updatedAt,
    }),
  );
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
