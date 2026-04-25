import { Hono } from "hono";
import type {
  ApiErrorBody,
  ApiSuccess,
  Comment,
  UpdateCommentRequest,
} from "@bg/shared";
import {
  createProjectComment,
  listProjectComments,
  updateProjectComment,
} from "../db/comments";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const commentRoutes = new Hono();

commentRoutes.get("/api/projects/:id/comments", async (c) => {
  const id = c.req.param("id");
  const project = await getProjectDetail(id);
  if (!project) {
    return c.json(fail("project_not_found", "Project not found", { id }), 404);
  }
  const rows = await listProjectComments(id);
  return c.json(ok(rows satisfies Comment[]));
});

commentRoutes.post("/api/projects/:id/comments", async (c) => {
  const id = c.req.param("id");
  const project = await getProjectDetail(id);
  if (!project) {
    return c.json(fail("project_not_found", "Project not found", { id }), 404);
  }

  const body = await c.req.json<unknown>().catch(() => null);
  if (!isRecord(body)) {
    return c.json(
      fail("invalid_body", "Expected a JSON object request body"),
      400,
    );
  }

  const {
    rel_path,
    node_selector,
    x_pct,
    y_pct,
    slide_index,
    body: commentBody,
  } = body;
  if (typeof rel_path !== "string" || rel_path.trim().length === 0) {
    return c.json(
      fail("invalid_rel_path", "rel_path is required", { rel_path }),
      400,
    );
  }
  // Pin coordinates are normalised percentages — values outside 0..100
  // would render off the canvas and be unclickable. Reject up front so
  // a misbehaving client can't poison the comments table with
  // unreachable pins (audit fix).
  if (
    typeof x_pct !== "number" ||
    !Number.isFinite(x_pct) ||
    x_pct < 0 ||
    x_pct > 100
  ) {
    return c.json(
      fail("invalid_x_pct", "x_pct must be a number in 0..100", { x_pct }),
      400,
    );
  }
  if (
    typeof y_pct !== "number" ||
    !Number.isFinite(y_pct) ||
    y_pct < 0 ||
    y_pct > 100
  ) {
    return c.json(
      fail("invalid_y_pct", "y_pct must be a number in 0..100", { y_pct }),
      400,
    );
  }
  let slideIndex: number | null | undefined;
  if (slide_index === undefined || slide_index === null) {
    slideIndex = slide_index;
  } else if (
    typeof slide_index === "number" &&
    Number.isInteger(slide_index) &&
    slide_index >= 0
  ) {
    slideIndex = slide_index;
  } else {
    return c.json(
      fail("invalid_slide_index", "slide_index must be a non-negative integer or null"),
      400,
    );
  }

  const created = await createProjectComment(id, {
    rel_path,
    node_selector: typeof node_selector === "string" ? node_selector : undefined,
    x_pct,
    y_pct,
    slide_index: slideIndex,
    body: typeof commentBody === "string" ? commentBody : undefined,
  });

  return c.json(ok(created), 201);
});

commentRoutes.patch("/api/projects/:id/comments/:commentId", async (c) => {
  const id = c.req.param("id");
  const commentId = c.req.param("commentId");
  const project = await getProjectDetail(id);
  if (!project) {
    return c.json(fail("project_not_found", "Project not found", { id }), 404);
  }

  const body = await c.req.json<unknown>().catch(() => null);
  if (!isRecord(body)) {
    return c.json(
      fail("invalid_body", "Expected a JSON object request body"),
      400,
    );
  }

  const patch: UpdateCommentRequest = {};
  if ("body" in body) {
    if (typeof body.body !== "string") {
      return c.json(fail("invalid_body_field", "body must be a string"), 400);
    }
    patch.body = body.body;
  }
  if ("resolved" in body) {
    if (typeof body.resolved !== "boolean") {
      return c.json(fail("invalid_resolved", "resolved must be a boolean"), 400);
    }
    patch.resolved = body.resolved;
  }

  const updated = await updateProjectComment(id, commentId, patch);
  if (!updated) {
    return c.json(
      fail("comment_not_found", "Comment not found", { commentId }),
      404,
    );
  }
  return c.json(ok(updated));
});
