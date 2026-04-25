import { describe, expect, test } from "bun:test";
import type { ExportJob } from "@bg/shared";
import {
  DEFAULT_EXPORT_RETENTION_MS,
  pruneOldExports,
} from "../src/services/export-gc";

const NOW = Date.UTC(2026, 3, 25); // 2026-04-25 00:00 UTC

function makeJob(overrides: Partial<ExportJob>): ExportJob {
  return {
    id: "job-1",
    project_id: "proj-1",
    format: "html_zip",
    status: "succeeded",
    output_path: "/exports/job-1.zip",
    error_message: null,
    size_bytes: 1024,
    created_at: NOW - DEFAULT_EXPORT_RETENTION_MS - 86400_000, // 8 days ago
    completed_at: NOW - DEFAULT_EXPORT_RETENTION_MS - 86400_000,
    ...overrides,
  };
}

interface FakeDeps {
  jobs: ExportJob[];
  fileSizes?: Map<string, number>;
  deletedIds: string[];
  unlinkedPaths: string[];
}

function makeDeps(state: FakeDeps) {
  return {
    listStale: async (cutoffMs: number) =>
      state.jobs.filter(
        (j) =>
          j.status === "succeeded" &&
          (j.completed_at ?? Number.MAX_SAFE_INTEGER) < cutoffMs,
      ),
    deleteJob: async (id: string) => {
      state.deletedIds.push(id);
    },
    statFile: async (filePath: string) => {
      const size = state.fileSizes?.get(filePath);
      if (size === undefined) {
        throw new Error(`ENOENT ${filePath}`);
      }
      return { size };
    },
    unlinkFile: async (filePath: string) => {
      state.unlinkedPaths.push(filePath);
    },
  };
}

describe("pruneOldExports", () => {
  test("removes succeeded jobs older than the retention window", async () => {
    const state: FakeDeps = {
      jobs: [
        makeJob({ id: "old-1", output_path: "/exports/old-1.zip" }),
        makeJob({ id: "old-2", output_path: "/exports/old-2.zip" }),
      ],
      fileSizes: new Map([
        ["/exports/old-1.zip", 2048],
        ["/exports/old-2.zip", 4096],
      ]),
      deletedIds: [],
      unlinkedPaths: [],
    };
    const result = await pruneOldExports({ now: NOW }, makeDeps(state));
    expect(result.removedJobs).toBe(2);
    expect(result.removedBytes).toBe(2048 + 4096);
    expect(result.removedFiles).toEqual([
      "/exports/old-1.zip",
      "/exports/old-2.zip",
    ]);
    expect(result.missingFiles).toEqual([]);
    expect(state.deletedIds).toEqual(["old-1", "old-2"]);
    expect(state.unlinkedPaths).toEqual([
      "/exports/old-1.zip",
      "/exports/old-2.zip",
    ]);
  });

  test("dryRun reports the work but does not unlink or delete anything", async () => {
    const state: FakeDeps = {
      jobs: [makeJob({ id: "old-1", output_path: "/exports/old-1.zip" })],
      fileSizes: new Map([["/exports/old-1.zip", 2048]]),
      deletedIds: [],
      unlinkedPaths: [],
    };
    const result = await pruneOldExports(
      { now: NOW, dryRun: true },
      makeDeps(state),
    );
    expect(result.removedJobs).toBe(1);
    expect(result.removedBytes).toBe(2048);
    expect(state.deletedIds).toEqual([]);
    expect(state.unlinkedPaths).toEqual([]);
  });

  test("missing files still drop the DB row so dead download URLs do not linger", async () => {
    const state: FakeDeps = {
      jobs: [makeJob({ id: "old-1", output_path: "/exports/missing.zip" })],
      fileSizes: new Map(), // no file exists
      deletedIds: [],
      unlinkedPaths: [],
    };
    const result = await pruneOldExports({ now: NOW }, makeDeps(state));
    expect(result.removedJobs).toBe(1);
    expect(result.removedBytes).toBe(0);
    expect(result.removedFiles).toEqual([]);
    expect(result.missingFiles).toEqual(["/exports/missing.zip"]);
    // DB row still pruned even though no file was on disk.
    expect(state.deletedIds).toEqual(["old-1"]);
    // No unlink attempted because stat failed first.
    expect(state.unlinkedPaths).toEqual([]);
  });

  test("respects a custom retention window", async () => {
    // Set retention to 1 hour. A 2-hour-old succeeded job is stale;
    // a 30-minute-old job is fresh.
    const state: FakeDeps = {
      jobs: [
        makeJob({
          id: "two-hours-old",
          completed_at: NOW - 2 * 60 * 60 * 1000,
          output_path: "/exports/two-hours-old.zip",
        }),
        makeJob({
          id: "half-hour-old",
          completed_at: NOW - 30 * 60 * 1000,
          output_path: "/exports/half-hour-old.zip",
        }),
      ],
      fileSizes: new Map([
        ["/exports/two-hours-old.zip", 1024],
        ["/exports/half-hour-old.zip", 1024],
      ]),
      deletedIds: [],
      unlinkedPaths: [],
    };
    const result = await pruneOldExports(
      { now: NOW, retentionMs: 60 * 60 * 1000 },
      makeDeps(state),
    );
    expect(state.deletedIds).toEqual(["two-hours-old"]);
    expect(result.removedJobs).toBe(1);
  });

  test("never asks for failed / pending / running jobs (listStale filters)", async () => {
    // The fake listStale honours status=succeeded explicitly. We
    // assert here that pruneOldExports doesn't try to second-guess
    // the query — feeding in a mixed list, only the succeeded one
    // should be processed.
    const state: FakeDeps = {
      jobs: [
        makeJob({ id: "succeeded-old", status: "succeeded" }),
        makeJob({ id: "failed-old", status: "failed" }),
        makeJob({ id: "running-old", status: "running" }),
      ],
      fileSizes: new Map([["/exports/job-1.zip", 1024]]),
      deletedIds: [],
      unlinkedPaths: [],
    };
    await pruneOldExports({ now: NOW }, makeDeps(state));
    expect(state.deletedIds).toEqual(["succeeded-old"]);
  });
});
