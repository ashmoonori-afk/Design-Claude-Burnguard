import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { closeProjectWatcher } from "../services/watchers";
import type { ApiErrorBody, ApiSuccess, ProjectDetail, SessionInfo } from "@bg/shared";
import { getDb } from "../db/client";
import { projectsTable } from "../db/schema";
import {
  getLatestProjectSession,
  getProjectDetail,
  getSessionInfo,
} from "../db/seed";

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

export const projectRoutes = new Hono();

projectRoutes.get("/api/projects/:id", async (c) => {
  const id = c.req.param("id");
  const project = await getProjectDetail(id);
  if (!project) {
    return c.json(fail("project_not_found", "Project not found", { id }), 404);
  }
  return c.json(ok(project satisfies ProjectDetail));
});

projectRoutes.get("/api/projects/:id/session", async (c) => {
  const id = c.req.param("id");
  const session = await getLatestProjectSession(id);
  if (!session) {
    return c.json(fail("session_not_found", "Session not found", { project_id: id }), 404);
  }
  return c.json(ok(session satisfies SessionInfo));
});

projectRoutes.get("/api/sessions/:id", async (c) => {
  const id = c.req.param("id");
  const session = await getSessionInfo(id);
  if (!session) {
    return c.json(fail("session_not_found", "Session not found", { id }), 404);
  }
  return c.json(ok(session satisfies SessionInfo));
});

projectRoutes.delete("/api/projects/:id", async (c) => {
  const id = c.req.param("id");
  const project = await getProjectDetail(id);
  if (!project) {
    return c.json(fail("project_not_found", "Project not found", { id }), 404);
  }

  // Stop the FS watcher first so it doesn't keep firing change events
  // on the directory we're about to remove. Also clears any pending
  // debounce timers and the cached sessionId for this project so a
  // freshly created project that re-uses the same id starts clean.
  closeProjectWatcher(id);

  // Remove the filesystem directory (ignore errors so the DB row still
  // gets cleaned up even if a file handle is held or the dir is gone).
  await rm(project.dir_path, { recursive: true, force: true }).catch(() => {});

  // ON DELETE CASCADE on sessions/events/attachments/files/comments/tweaks/exports
  // removes the rest.
  await getDb().delete(projectsTable).where(eq(projectsTable.id, id));

  return c.body(null, 204);
});
