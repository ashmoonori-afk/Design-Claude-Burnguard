import type { FSWatcher } from "node:fs";

export const RESERVED_PROJECT_WATCHER = Symbol("bg-reserved-watcher");
export const projectWatchers = new Map<string, FSWatcher | typeof RESERVED_PROJECT_WATCHER>();
export const projectSessionIds = new Map<string, string>();
export function closeProjectWatcher(projectId: string): void {
  const watcher = projectWatchers.get(projectId);
  if (watcher && watcher !== RESERVED_PROJECT_WATCHER) {
    try { watcher.close(); }
    catch (error) {
      if (!(error instanceof Error)) throw error;
    }
  }
  projectWatchers.delete(projectId);
  projectSessionIds.delete(projectId);
}
