import { ulid } from "ulid";
import type { NormalizedEvent } from "@bg/shared";
import { insertNormalizedEvent } from "../db/events";
import { broker } from "./broker";
import { appendSessionTrace } from "./trace";

const DEDUPE_WINDOW_MS = 2_000;
const MAX_ENTRIES_PER_PROJECT = 256;

interface RecentEntry {
  path: string;
  ts: number;
}

const recentByProject = new Map<string, RecentEntry[]>();

function keyPath(relPath: string): string {
  return relPath.replaceAll("\\", "/");
}

function gc(list: RecentEntry[], now: number): RecentEntry[] {
  const cutoff = now - DEDUPE_WINDOW_MS;
  const kept = list.filter((entry) => entry.ts >= cutoff);
  if (kept.length > MAX_ENTRIES_PER_PROJECT) {
    kept.splice(0, kept.length - MAX_ENTRIES_PER_PROJECT);
  }
  return kept;
}

/**
 * Records that a `file.changed` event was just emitted (or is about
 * to be) for the given project+path. Watcher fs events arriving
 * within `DEDUPE_WINDOW_MS` for the same path are suppressed so an
 * adapter write doesn't produce two duplicate events — one from the
 * adapter parser, one from the fs watcher catching its own write.
 */
export function noteEmittedFileChange(projectId: string, relPath: string): void {
  const now = Date.now();
  const key = keyPath(relPath);
  const list = gc(recentByProject.get(projectId) ?? [], now);
  list.push({ path: key, ts: now });
  recentByProject.set(projectId, list);
}

export function shouldEmitFileChange(
  projectId: string,
  relPath: string,
): boolean {
  const now = Date.now();
  const key = keyPath(relPath);
  const list = gc(recentByProject.get(projectId) ?? [], now);
  recentByProject.set(projectId, list);
  return !list.some((entry) => entry.path === key);
}

/**
 * Publishes a normalized `file.changed` event to the given session
 * with both DB persistence + broker fanout. Used by the watcher
 * path; adapter events go through `persistAndPublish` in turns.ts.
 * Both routes register into the same dedupe cache.
 */
export async function publishFileChangeFromWatcher(
  projectId: string,
  sessionId: string,
  relPath: string,
  action: "created" | "edited" | "deleted",
): Promise<void> {
  const event: NormalizedEvent = {
    id: ulid(),
    ts: Date.now(),
    type: "file.changed",
    turnId: "external",
    action,
    path: keyPath(relPath),
  };
  await insertNormalizedEvent(sessionId, event).catch(() => {});
  await appendSessionTrace(sessionId, {
    level: "file_change_watcher",
    event,
  }).catch(() => {});
  broker.publish(sessionId, event);
  noteEmittedFileChange(projectId, relPath);
}
