import { watch, type FSWatcher } from "node:fs";
import { getSqlite } from "../db/sqlite-client";
import { getLatestProjectSession, getProjectDetail, listProjectIds } from "../db/project-read-repository";
import { ArtifactCoordinator } from "./artifact-coordinator";
import { isArtifactPublicationActive } from "./artifact-publication-registry";
import { appendSessionTrace } from "./trace";
import { isTransientFilePath } from "./files";
import {
  RESERVED_PROJECT_WATCHER,
  projectSessionIds as sessionIdCache,
  projectWatchers as watchers,
} from "./watcher-registry";

const IGNORED_TOP_LEVEL = new Set([".meta", ".attachments", ".git", ".omc", ".claude"]);
const pendingSignals = new Set<string>();

type ErrorAwareWatcher = FSWatcher & {
  on(event: "error", listener: (error: Error) => void): ErrorAwareWatcher;
};

export async function ensureProjectWatcher(projectId: string): Promise<void> {
  if (watchers.has(projectId)) return;
  const project = await getProjectDetail(projectId);
  if (project === null) return;
  watchers.set(projectId, RESERVED_PROJECT_WATCHER);
  let watcher: ErrorAwareWatcher;
  try {
    const coordinator = new ArtifactCoordinator(getSqlite());
    if (project.current_digest === null) await coordinator.initialize(projectId, project.dir_path);
    else await coordinator.observeExternal(projectId, project.dir_path);
    watcher = watch(project.dir_path, { recursive: true }, (_eventType, filename) => {
      if (filename === null) return;
      const relPath = String(filename).replaceAll("\\", "/");
      if (shouldSkipPath(relPath)) return;
      void scheduleProjectSignal(projectId, project.dir_path);
    }) as ErrorAwareWatcher;
  } catch (error) {
    watchers.delete(projectId);
    throw error;
  }
  watcher.on("error", (error) => { void recordWatcherFailure(projectId, error); });
  watchers.set(projectId, watcher);
}

export async function ensureAllProjectWatchers(projectIds?: readonly string[]): Promise<void> {
  for (const projectId of projectIds ?? await listProjectIds()) {
    try { await ensureProjectWatcher(projectId); }
    catch (error) { console.warn("[watcher] project watcher unavailable", projectId, error); }
  }
}

export function shouldSkipPath(relPath: string): boolean {
  const top = relPath.split("/")[0];
  return top !== undefined && (IGNORED_TOP_LEVEL.has(top) || isTransientFilePath(relPath));
}

export async function processProjectFilesystemSignal(projectId: string, projectDir: string) {
  if (isArtifactPublicationActive(projectId)) return null;
  return new ArtifactCoordinator(getSqlite()).observeExternal(projectId, projectDir);
}

export async function scheduleProjectSignal(projectId: string, projectDir: string): Promise<void> {
  if (pendingSignals.has(projectId)) return;
  pendingSignals.add(projectId);
  try { await processProjectFilesystemSignal(projectId, projectDir); }
  catch (error) { await recordWatcherFailure(projectId, error instanceof Error ? error : new Error("Watcher persistence failed")); }
  finally { pendingSignals.delete(projectId); }
}

async function recordWatcherFailure(projectId: string, error: Error): Promise<void> {
  const sessionId = await resolveSessionId(projectId);
  if (sessionId === null) throw error;
  await appendSessionTrace(sessionId, { level: "watcher_error", project_id: projectId, message: error.message });
}

async function resolveSessionId(projectId: string): Promise<string | null> {
  const cached = sessionIdCache.get(projectId);
  if (cached !== undefined) return cached;
  const session = await getLatestProjectSession(projectId);
  if (session === null) return null;
  sessionIdCache.set(projectId, session.id);
  return session.id;
}
