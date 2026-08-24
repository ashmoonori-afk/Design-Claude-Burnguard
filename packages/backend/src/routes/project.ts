import { rm } from "node:fs/promises";
import { Hono } from "hono";
import { closeProjectWatcher } from "../services/watcher-registry";
import type { ApiErrorBody, ApiSuccess, ProjectDetail, SessionInfo } from "@bg/shared";
import { getSqlite } from "../db/sqlite-client";
import { projectsDir, resolveManagedPath } from "../lib/paths";
import { getLatestProjectSession, getProjectDetail } from "../db/project-read-repository";
import { processProjectFilesystemSignal } from "../services/watchers";

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

projectRoutes.post("/api/projects/:id/qa/filesystem-signal", async (c) => {
  const id = c.req.param("id");
  if (process.env.BG_ARTIFACT_QA !== "1" || c.req.header("x-burnguard-qa-operation") !== process.env.BG_ARTIFACT_TURN_OPERATION_ID) return c.json(fail("not_found", "Not found"), 404);
  const project = await getProjectDetail(id);
  if (project === null) return c.json(fail("project_not_found", "Project not found", { id }), 404);
  const operation = await processProjectFilesystemSignal(id, project.dir_path);
  return c.json(ok({ operation_id: operation?.id ?? null, status: operation?.status ?? "unchanged" }));
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

  // Remove only managed project storage. Ignore filesystem errors so the DB
  // row still gets cleaned up if a file handle is held or the dir is gone.
  try {
    const projectDir = resolveManagedPath(projectsDir, project.dir_path);
    await rm(projectDir, { recursive: true, force: true });
  } catch {
    // Keep the route's existing best-effort deletion behavior.
  }

  // ON DELETE CASCADE on sessions/events/attachments/files/comments/tweaks/exports
  // removes the rest.
  getSqlite().prepare("DELETE FROM projects WHERE id=?").run(id);

  return c.body(null, 204);
});
