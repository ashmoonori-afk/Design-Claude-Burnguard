/**
 * Garbage-collects stale export artifacts so `~/.burnguard/cache/exports/`
 * doesn't grow without bound.
 *
 * Policy:
 *   - Succeeded jobs older than the retention window have their output
 *     file removed and the DB row deleted.
 *   - Failed jobs are kept (they preserve error_message for triage) —
 *     they also have no output file to delete.
 *   - Pending / running jobs are never touched (a runner may be holding
 *     them).
 *
 * Called once at bootstrap. The retention window is small enough that
 * a single pass per process start is plenty for a desktop app — long
 * sessions can opt into a periodic timer later if needed.
 */
import { stat, unlink } from "node:fs/promises";
import type { ExportJob } from "@bg/shared";
import {
  deleteExportJob,
  listStaleSucceededExports,
} from "../db/exports";

export const DEFAULT_EXPORT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface PruneOptions {
  /** How long a succeeded job is allowed to live. Defaults to 7 days. */
  retentionMs?: number;
  /** Override "now" for deterministic tests. */
  now?: number;
  /** When true, plan the work but do not delete anything. */
  dryRun?: boolean;
}

export interface PruneResult {
  removedJobs: number;
  removedBytes: number;
  /** Files that were on disk and got deleted. */
  removedFiles: string[];
  /** Jobs whose output_path was already missing — DB row still pruned. */
  missingFiles: string[];
}

/**
 * Injectable side effects so the loop can be unit-tested without
 * touching the real DB or filesystem. Production code uses the
 * defaults; tests substitute fakes.
 */
export interface PruneDeps {
  listStale?: (cutoffMs: number) => Promise<ExportJob[]>;
  deleteJob?: (id: string) => Promise<void>;
  statFile?: (path: string) => Promise<{ size: number }>;
  unlinkFile?: (path: string) => Promise<void>;
}

export async function pruneOldExports(
  options: PruneOptions = {},
  deps: PruneDeps = {},
): Promise<PruneResult> {
  const listStale = deps.listStale ?? listStaleSucceededExports;
  const deleteJob = deps.deleteJob ?? deleteExportJob;
  const statFile =
    deps.statFile ??
    (async (filePath) => {
      const info = await stat(filePath);
      return { size: info.size };
    });
  const unlinkFile = deps.unlinkFile ?? unlink;

  const retention = options.retentionMs ?? DEFAULT_EXPORT_RETENTION_MS;
  const now = options.now ?? Date.now();
  const cutoff = now - retention;

  const stale = await listStale(cutoff);
  const result: PruneResult = {
    removedJobs: 0,
    removedBytes: 0,
    removedFiles: [],
    missingFiles: [],
  };

  for (const job of stale) {
    if (job.output_path) {
      try {
        const info = await statFile(job.output_path);
        if (!options.dryRun) {
          await unlinkFile(job.output_path);
        }
        result.removedBytes += info.size;
        result.removedFiles.push(job.output_path);
      } catch {
        // File already gone — still drop the DB row so it doesn't
        // forever advertise a non-existent download URL.
        result.missingFiles.push(job.output_path);
      }
    }
    if (!options.dryRun) {
      await deleteJob(job.id);
    }
    result.removedJobs += 1;
  }

  return result;
}
