import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExportJob } from "@bg/shared";
import {
  DEFAULT_EXPORT_RETENTION_MS,
  pruneOldExports,
} from "../src/services/export-gc";

const NOW = Date.UTC(2026, 3, 25); // 2026-04-25 00:00 UTC
const EXPORTS_ROOT = mkdtempSync(path.join(tmpdir(), "bg-export-gc-"));

function exportPath(name: string): string {
  return path.join(EXPORTS_ROOT, name);
}

afterAll(() => {
  rmSync(EXPORTS_ROOT, { recursive: true, force: true });
});

function makeJob(overrides: Partial<ExportJob>): ExportJob {
  return {
    id: "job-1",
    project_id: "proj-1",
    format: "html_zip",
    status: "succeeded",
    output_path: exportPath("job-1.zip"),
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
    exportsRoot: EXPORTS_ROOT,
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
    const old1 = exportPath("old-1.zip");
    const old2 = exportPath("old-2.zip");
    const state: FakeDeps = {
      jobs: [
        makeJob({ id: "old-1", output_path: old1 }),
        makeJob({ id: "old-2", output_path: old2 }),
      ],
      fileSizes: new Map([
        [old1, 2048],
        [old2, 4096],
      ]),
      deletedIds: [],
      unlinkedPaths: [],
    };
    const result = await pruneOldExports({ now: NOW }, makeDeps(state));
    expect(result.removedJobs).toBe(2);
    expect(result.removedBytes).toBe(2048 + 4096);
    expect(result.removedFiles).toEqual([old1, old2]);
    expect(result.missingFiles).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(state.deletedIds).toEqual(["old-1", "old-2"]);
    expect(state.unlinkedPaths).toEqual([old1, old2]);
  });

  test("skips and warns about an output_path outside the exports root", async () => {
    const outsidePath = path.join(path.dirname(EXPORTS_ROOT), "victim.zip");
    const state: FakeDeps = {
      jobs: [makeJob({ id: "hostile", output_path: outsidePath })],
      fileSizes: new Map([[outsidePath, 4096]]),
      deletedIds: [],
      unlinkedPaths: [],
    };

    const result = await pruneOldExports({ now: NOW }, makeDeps(state));

    expect(state.unlinkedPaths).toEqual([]);
    expect(result.removedFiles).toEqual([]);
    expect(result.missingFiles).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Skipped unsafe output_path");
    expect(state.deletedIds).toEqual(["hostile"]);
  });

  test("dryRun reports the work but does not unlink or delete anything", async () => {
    const old1 = exportPath("old-1.zip");
    const state: FakeDeps = {
      jobs: [makeJob({ id: "old-1", output_path: old1 })],
      fileSizes: new Map([[old1, 2048]]),
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
    const missing = exportPath("missing.zip");
    const state: FakeDeps = {
      jobs: [makeJob({ id: "old-1", output_path: missing })],
      fileSizes: new Map(), // no file exists
      deletedIds: [],
      unlinkedPaths: [],
    };
    const result = await pruneOldExports({ now: NOW }, makeDeps(state));
    expect(result.removedJobs).toBe(1);
    expect(result.removedBytes).toBe(0);
    expect(result.removedFiles).toEqual([]);
    expect(result.missingFiles).toEqual([missing]);
    // DB row still pruned even though no file was on disk.
    expect(state.deletedIds).toEqual(["old-1"]);
    // No unlink attempted because stat failed first.
    expect(state.unlinkedPaths).toEqual([]);
  });

  test("respects a custom retention window", async () => {
    // Set retention to 1 hour. A 2-hour-old succeeded job is stale;
    // a 30-minute-old job is fresh.
    const twoHoursOld = exportPath("two-hours-old.zip");
    const halfHourOld = exportPath("half-hour-old.zip");
    const state: FakeDeps = {
      jobs: [
        makeJob({
          id: "two-hours-old",
          completed_at: NOW - 2 * 60 * 60 * 1000,
          output_path: twoHoursOld,
        }),
        makeJob({
          id: "half-hour-old",
          completed_at: NOW - 30 * 60 * 1000,
          output_path: halfHourOld,
        }),
      ],
      fileSizes: new Map([
        [twoHoursOld, 1024],
        [halfHourOld, 1024],
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
    const defaultPath = exportPath("job-1.zip");
    const state: FakeDeps = {
      jobs: [
        makeJob({ id: "succeeded-old", status: "succeeded" }),
        makeJob({ id: "failed-old", status: "failed" }),
        makeJob({ id: "running-old", status: "running" }),
      ],
      fileSizes: new Map([[defaultPath, 1024]]),
      deletedIds: [],
      unlinkedPaths: [],
    };
    await pruneOldExports({ now: NOW }, makeDeps(state));
    expect(state.deletedIds).toEqual(["succeeded-old"]);
  });
});
