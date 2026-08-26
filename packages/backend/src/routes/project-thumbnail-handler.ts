import type { ApiErrorBody } from "@bg/shared";
import type { Context } from "hono";
import { loadProjectThumbnail } from "../services/project-thumbnails";

const THUMBNAIL_FAILURES = {
  artifact_unavailable: {
    status: 409,
    message: "Project has no rendered artifact yet",
  },
  thumbnail_unavailable: {
    status: 503,
    message: "Thumbnail could not be rendered",
  },
} as const;

export async function serveProjectThumbnail(context: Context) {
  const id = context.req.param("id") ?? "";
  const outcome = await loadProjectThumbnail(id);
  switch (outcome.kind) {
    case "not_found":
      return context.json(fail("project_not_found", "Project not found", id), 404);
    case "unavailable": {
      const failure = THUMBNAIL_FAILURES[outcome.code];
      return context.json(
        fail(outcome.code, failure.message, id),
        failure.status,
      );
    }
    case "ready": {
      const headers = {
        "Content-Type": "image/png",
        ETag: outcome.etag,
        "Cache-Control": "private, no-cache",
      };
      if (context.req.header("if-none-match") === outcome.etag) {
        return new Response(null, { status: 304, headers });
      }
      return new Response(outcome.bytes, { status: 200, headers });
    }
  }
}

function fail(code: string, message: string, id: string): ApiErrorBody {
  return { error: { code, message, details: { id } } };
}
