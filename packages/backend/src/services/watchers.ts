import { watch, type FSWatcher } from "node:fs";
import { getProjectDetail, listProjectIds } from "../db/seed";
import { indexProjectFiles } from "./files";
import { appendSessionTrace } from "./trace";

const watchers = new Map<string, FSWatcher>();
const pending = new Map<string, Timer>();

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
    () => {
      scheduleReindex(projectId);
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

function scheduleReindex(projectId: string) {
  const existing = pending.get(projectId);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    pending.delete(projectId);
    void indexProjectFiles(projectId);
  }, 250);

  pending.set(projectId, timer);
}

