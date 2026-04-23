import { rm } from "node:fs/promises";
import { Hono } from "hono";
import type {
  ApiErrorBody,
  ApiSuccess,
  CreateDesignSystemExtractionRequest,
  CreateDesignSystemExtractionResponse,
  CreateDesignSystemUploadResponse,
  DeleteDesignSystemResponse,
  DesignSystemDetail,
  UpdateDesignSystemRequest,
} from "@bg/shared";
import {
  deleteDesignSystemRecord,
  getDesignSystemDetail,
  listActiveProjectsForDesignSystem,
  updateDesignSystemRecord,
} from "../db/seed";
import {
  contentTypeForDesignSystemFile,
  DesignSystemExtractError,
  extractDesignSystemFromSource,
  extractDesignSystemFromUpload,
  resolveDesignSystemFile,
} from "../services/design-system-extract";

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

export const systemRoutes = new Hono();

systemRoutes.post("/api/design-systems/extract", async (c) => {
  const body = await c.req.json<unknown>().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json(fail("invalid_body", "Expected a JSON object request body"), 400);
  }

  try {
    const result = await extractDesignSystemFromSource(
      body as CreateDesignSystemExtractionRequest,
    );
    return c.json(ok(result satisfies CreateDesignSystemExtractionResponse), 201);
  } catch (err) {
    if (err instanceof DesignSystemExtractError) {
      return c.json(fail(err.code, err.message), 400);
    }
    return c.json(
      fail(
        "design_system_extract_failed",
        err instanceof Error ? err.message : String(err),
      ),
      500,
    );
  }
});

systemRoutes.post("/api/design-systems/upload", async (c) => {
  const form = await c.req.formData().catch(() => null);
  if (!form) {
    return c.json(
      fail("invalid_body", "Expected a multipart/form-data request body"),
      400,
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json(
      fail("invalid_upload", "Expected a .pptx or .pdf file in the `file` field"),
      400,
    );
  }

  const name = form.get("name");
  const systemId = form.get("system_id");

  try {
    const result = await extractDesignSystemFromUpload({
      file,
      body: {
        name: typeof name === "string" ? name : undefined,
        system_id: typeof systemId === "string" ? systemId : undefined,
      },
    });
    return c.json(ok(result satisfies CreateDesignSystemUploadResponse), 201);
  } catch (err) {
    if (err instanceof DesignSystemExtractError) {
      return c.json(fail(err.code, err.message), 400);
    }
    return c.json(
      fail(
        "design_system_upload_failed",
        err instanceof Error ? err.message : String(err),
      ),
      500,
    );
  }
});

systemRoutes.get("/api/design-systems/:id", async (c) => {
  const id = c.req.param("id");
  const system = await getDesignSystemDetail(id);
  if (!system) {
    return c.json(
      fail("design_system_not_found", "Design system not found", { id }),
      404,
    );
  }
  return c.json(ok(system satisfies DesignSystemDetail));
});

systemRoutes.patch("/api/design-systems/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await getDesignSystemDetail(id);
  if (!existing) {
    return c.json(
      fail("design_system_not_found", "Design system not found", { id }),
      404,
    );
  }

  const body = (await c.req.json<unknown>().catch(() => null)) as
    | UpdateDesignSystemRequest
    | null;
  if (!body || typeof body !== "object") {
    return c.json(fail("invalid_body", "Expected a JSON object body"), 400);
  }

  const patch: UpdateDesignSystemRequest = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return c.json(
        fail("invalid_name", "name must be a non-empty string"),
        400,
      );
    }
    patch.name = body.name.trim();
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      return c.json(
        fail("invalid_description", "description must be a string or null"),
        400,
      );
    }
    patch.description =
      body.description === null ? null : body.description.trim() || null;
  }
  if (body.status !== undefined) {
    if (
      body.status !== "draft" &&
      body.status !== "review" &&
      body.status !== "published"
    ) {
      return c.json(
        fail("invalid_status", "status must be draft / review / published"),
        400,
      );
    }
    patch.status = body.status;
  }

  if (Object.keys(patch).length === 0) {
    return c.json(
      fail("empty_patch", "At least one of name / description / status is required"),
      400,
    );
  }

  const updated = await updateDesignSystemRecord(id, patch);
  if (!updated) {
    return c.json(
      fail("design_system_not_found", "Design system disappeared mid-update", {
        id,
      }),
      404,
    );
  }
  return c.json(ok(updated satisfies DesignSystemDetail));
});

systemRoutes.delete("/api/design-systems/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await getDesignSystemDetail(id);
  if (!existing) {
    return c.json(
      fail("design_system_not_found", "Design system not found", { id }),
      404,
    );
  }
  if (existing.is_template) {
    return c.json(
      fail(
        "is_template",
        "Seeded template systems cannot be deleted",
        { id, reason: "is_template" },
      ),
      409,
    );
  }
  const refs = await listActiveProjectsForDesignSystem(id);
  if (refs.length > 0) {
    return c.json(
      fail(
        "has_active_projects",
        `${refs.length} project(s) still reference this design system. Reassign them first.`,
        { id, reason: "has_active_projects", project_refs: refs },
      ),
      409,
    );
  }

  await deleteDesignSystemRecord(id);
  await rm(existing.dir_path, { recursive: true, force: true }).catch(() => {
    // The DB row is already gone; failing to delete the directory
    // leaves stale bytes on disk but keeps the UI consistent.
  });
  return c.json(ok({ id, deleted: true } satisfies DeleteDesignSystemResponse));
});

systemRoutes.get("/api/design-systems/:id/files/*", async (c) => {
  const id = c.req.param("id");
  const prefix = `/api/design-systems/${id}/files/`;
  const rawPath = new URL(c.req.url).pathname;
  const relPath = rawPath.startsWith(prefix)
    ? decodeURIComponent(rawPath.slice(prefix.length))
    : "";
  const absolutePath = await resolveDesignSystemFile(id, relPath);
  if (!absolutePath) {
    return c.json(
      fail("design_system_file_not_found", "Design system file not found", {
        id,
        path: relPath,
      }),
      404,
    );
  }
  return new Response(Bun.file(absolutePath), {
    headers: {
      "Content-Type": contentTypeForDesignSystemFile(relPath),
      "Cache-Control": "no-cache",
    },
  });
});
