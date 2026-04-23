import { watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import {
  getLatestProjectSession,
  getProjectDetail,
  listProjectIds,
} from "../db/seed";
import {
  publishFileChangeFromWatcher,
  shouldEmitFileChange,
} from "./file-change-broker";
import { indexProjectFiles } from "./files";
import { appendSessionTrace } from "./trace";

const IGNORED_TOP_LEVEL = new Set([".meta", ".attachments"]);

const watchers = new Map<string, FSWatcher>();
const pendingReindex = new Map<string, Timer>();
const pendingEmit = new Map<string, Timer>();
const sessionIdCache = new Map<string, string>();

export async function ensureProjectWatcher(projectId: string) {
  if (watchers.has(projectId)) {
    return;
  }

  const project = await getProjectDetail(projectId);
  if (!project) {
    return;
  }

  await indexProjectFiles(projectId);

  const watcher = watch(
    project.dir_path,
    { recursive: true },
    (_eventType, filename) => {
      scheduleReindex(projectId);
      if (!filename) return;
      const relPath = String(filename).replaceAll("\\", "/");
      if (shouldSkipPath(relPath)) return;
      scheduleEmit(projectId, project.dir_path, relPath);
    },
  );

  watcher.on("error", (error) => {
    void appendSessionTrace(projectId, {
      level: "watcher_error",
      message: error.message,
    });
  });

  watchers.set(projectId, watcher);
}

export async function ensureAllProjectWatchers() {
  const projectIds = await listProjectIds();
  await Promise.all(projectIds.map((projectId) => ensureProjectWatcher(projectId)));
}

function shouldSkipPath(relPath: string): boolean {
  const top = relPath.split("/")[0];
  return IGNORED_TOP_LEVEL.has(top);
}

function scheduleReindex(projectId: string) {
  const existing = pendingReindex.get(projectId);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    pendingReindex.delete(projectId);
    void indexProjectFiles(projectId);
  }, 250);

  pendingReindex.set(projectId, timer);
}

/**
 * Watcher-driven `file.changed` emitter. Debounced per (projectId,
 * relPath) so a single VS Code save doesn't broadcast three events
 * for the same path. Dedupe against adapter-emitted events happens
 * inside `publishFileChangeFromWatcher` via `shouldEmitFileChange`
 * — an adapter write that the fs watcher catches ~10ms later gets
 * suppressed at the gate.
 */
function scheduleEmit(projectId: string, projectDir: string, relPath: string) {
  const key = `${projectId}:${relPath}`;
  const existing = pendingEmit.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    pendingEmit.delete(key);
    try {
      if (!shouldEmitFileChange(projectId, relPath)) return;
      const sessionId = await resolveSessionId(projectId);
      if (!sessionId) return;

      const absolute = path.join(projectDir, relPath);
      let action: "created" | "edited" | "deleted" = "edited";
      try {
        const info = await stat(absolute);
        if (!info.isFile()) return;
      } catch {
        action = "deleted";
      }
      await publishFileChangeFromWatcher(projectId, sessionId, relPath, action);
    } catch {
      // Watcher failures are non-fatal; swallow so the debounce
      // doesn't leave a dangling rejected promise.
    }
  }, 120);

  pendingEmit.set(key, timer);
}

async function resolveSessionId(projectId: string): Promise<string | null> {
  const cached = sessionIdCache.get(projectId);
  if (cached) return cached;
  const session = await getLatestProjectSession(projectId);
  if (!session) return null;
  sessionIdCache.set(projectId, session.id);
  return session.id;
}
