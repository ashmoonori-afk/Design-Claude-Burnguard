import { describe, expect, test } from "bun:test";
import { pruneOldExports, type ExpiredAttempt } from "../src/services/export-gc";

const NOW = Date.UTC(2026, 3, 25);
function attempt(overrides: Partial<ExpiredAttempt> = {}): ExpiredAttempt {
  return { attemptId: "attempt-1", jobId: "job-1", retainedUntil: NOW - 1, outputAvailable: true, ...overrides };
}

describe("pruneOldExports", () => {
  test("Given expired validated output When GC runs Then authority is claimed before owned bytes are removed", async () => {
    const order: string[] = [];
    const result = await pruneOldExports({ now: NOW }, {
      listExpired: async () => [attempt()],
      claim: async (id) => { order.push(`claim:${id}`); return true; },
      removeDirectory: async (id) => { order.push(`remove:${id}`); return 2048; },
    });
    expect(order).toEqual(["claim:attempt-1", "remove:attempt-1"]);
    expect(result.removedJobs).toBe(1);
    expect(result.removedBytes).toBe(2048);
  });

  test("Given a concurrent claim loss When GC runs Then bytes remain untouched", async () => {
    let removed = false;
    const result = await pruneOldExports({ now: NOW }, {
      listExpired: async () => [attempt()], claim: async () => false,
      removeDirectory: async () => { removed = true; return 1; },
    });
    expect(removed).toBe(false);
    expect(result.removedJobs).toBe(0);
  });

  test("Given an already tombstoned attempt after a crash When GC restarts Then removal completes without a second claim", async () => {
    let claims = 0;
    const result = await pruneOldExports({ now: NOW }, {
      listExpired: async () => [attempt({ outputAvailable: false })],
      claim: async () => { claims += 1; return true; },
      removeDirectory: async () => 512,
    });
    expect(claims).toBe(0);
    expect(result.removedBytes).toBe(512);
    expect(result.removedFiles).toEqual(["attempt-1"]);
  });

  test("Given unlink failure after tombstone When GC runs Then audit remains claimed and failure is reported", async () => {
    const result = await pruneOldExports({ now: NOW }, {
      listExpired: async () => [attempt()], claim: async () => true,
      removeDirectory: async () => { throw new TypeError("owned unlink failed"); },
    });
    expect(result.removedJobs).toBe(0);
    expect(result.warnings).toEqual(["owned unlink failed"]);
  });

  test("Given dry run When GC plans Then neither claim nor unlink occurs", async () => {
    let effects = 0;
    const result = await pruneOldExports({ now: NOW, dryRun: true }, {
      listExpired: async () => [attempt()], claim: async () => { effects += 1; return true; },
      removeDirectory: async () => { effects += 1; return 1; },
    });
    expect(effects).toBe(0);
    expect(result.removedJobs).toBe(1);
  });
});
