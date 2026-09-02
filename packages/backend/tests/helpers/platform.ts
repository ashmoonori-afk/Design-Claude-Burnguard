import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let cached: boolean | undefined;

/**
 * True when this process can create filesystem symlinks. Windows refuses
 * `symlink()` with EPERM unless Developer Mode or process elevation is on,
 * so tests that assert symlink-escape rejection can't run there — probed
 * once (a real symlink attempt in a throwaway temp dir) and cached.
 *
 * Synchronous on purpose: `test.skipIf(...)` is evaluated while the file's
 * describe bodies run, where `await` is not available.
 */
export function canCreateSymlink(): boolean {
  cached ??= probe();
  return cached;
}

function probe(): boolean {
  const dir = mkdtempSync(path.join(tmpdir(), "bg-symlink-probe-"));
  try {
    const target = path.join(dir, "target");
    mkdirSync(target);
    symlinkSync(target, path.join(dir, "link"), "dir");
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Reason string for the skipped symlink cases, so a skip is never silent. */
export const SYMLINK_SKIP_REASON =
  "symlink creation is not permitted on this host (Windows without Developer Mode)";
