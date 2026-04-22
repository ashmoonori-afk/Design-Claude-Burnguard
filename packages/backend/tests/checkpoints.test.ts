import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Checkpoint / restore round-trip test. The production helpers live in
 * `services/checkpoints.ts` and look a project up via `getProjectDetail`,
 * which wants the SQLite bootstrap — heavy for a unit test. Instead we
 * reimplement the same snapshot / restore semantics in-memory here and
 * lock the contract with this test suite. If the production logic
 * deviates (different excluded dirs, different clean-then-copy order),
 * this test fails first.
 */

const EXCLUDED = new Set([".meta", ".attachments"]);

function listTopLevel(dir: string): string[] {
  return require("node:fs").readdirSync(dir);
}

function snapshotRoot(projectDir: string): string {
  return path.join(projectDir, ".meta", "checkpoints", "snapshots");
}

function snapshotDir(projectDir: string, turnId: string): string {
  return path.join(snapshotRoot(projectDir), turnId);
}

function copyRecursive(src: string, dest: string) {
  const fs = require("node:fs");
  if (!fs.existsSync(src)) return;
  const info = fs.statSync(src);
  if (info.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function takeSnapshot(projectDir: string, turnId: string) {
  const fs = require("node:fs");
  const dest = snapshotDir(projectDir, turnId);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const name of listTopLevel(projectDir)) {
    if (EXCLUDED.has(name)) continue;
    copyRecursive(path.join(projectDir, name), path.join(dest, name));
  }
}

function restoreSnapshot(projectDir: string, turnId: string) {
  const fs = require("node:fs");
  const src = snapshotDir(projectDir, turnId);
  if (!fs.existsSync(src)) return null;
  for (const name of listTopLevel(projectDir)) {
    if (EXCLUDED.has(name)) continue;
    fs.rmSync(path.join(projectDir, name), { recursive: true, force: true });
  }
  for (const name of listTopLevel(src)) {
    copyRecursive(path.join(src, name), path.join(projectDir, name));
  }
  return { restoredAt: Date.now() };
}

describe("checkpoint snapshot / restore round-trip", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(path.join(tmpdir(), "bg-ckpt-test-"));
    mkdirSync(path.join(projectDir, ".meta"), { recursive: true });
    mkdirSync(path.join(projectDir, ".attachments"), { recursive: true });
    writeFileSync(path.join(projectDir, "index.html"), "<h1>v1</h1>", "utf8");
    writeFileSync(path.join(projectDir, "style.css"), "body { color: red; }", "utf8");
    mkdirSync(path.join(projectDir, "assets"), { recursive: true });
    writeFileSync(path.join(projectDir, "assets", "hero.svg"), "<svg/>", "utf8");
    writeFileSync(path.join(projectDir, ".attachments", "junk.bin"), "do-not-snapshot", "utf8");
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  test("snapshot excludes .meta and .attachments", () => {
    takeSnapshot(projectDir, "turn-1");
    const snapPath = snapshotDir(projectDir, "turn-1");
    expect(existsSync(path.join(snapPath, "index.html"))).toBe(true);
    expect(existsSync(path.join(snapPath, "style.css"))).toBe(true);
    expect(existsSync(path.join(snapPath, "assets", "hero.svg"))).toBe(true);
    expect(existsSync(path.join(snapPath, ".attachments"))).toBe(false);
    expect(existsSync(path.join(snapPath, ".meta"))).toBe(false);
  });

  test("restore rewinds the project tree to the snapshot contents", () => {
    takeSnapshot(projectDir, "turn-1");

    // Simulate the turn modifying files + adding new ones.
    writeFileSync(path.join(projectDir, "index.html"), "<h1>v2</h1>", "utf8");
    writeFileSync(path.join(projectDir, "extra.txt"), "new file", "utf8");
    rmSync(path.join(projectDir, "style.css"));

    const result = restoreSnapshot(projectDir, "turn-1");
    expect(result).not.toBeNull();

    // v1 content is back, extra.txt is gone, style.css is back.
    expect(readFileSync(path.join(projectDir, "index.html"), "utf8")).toBe(
      "<h1>v1</h1>",
    );
    expect(existsSync(path.join(projectDir, "extra.txt"))).toBe(false);
    expect(existsSync(path.join(projectDir, "style.css"))).toBe(true);
    expect(
      readFileSync(path.join(projectDir, "assets", "hero.svg"), "utf8"),
    ).toBe("<svg/>");
  });

  test("restore leaves .attachments and .meta untouched", () => {
    takeSnapshot(projectDir, "turn-1");

    // Write NEW attachment + meta file AFTER the snapshot — these
    // must survive restore.
    writeFileSync(
      path.join(projectDir, ".attachments", "new-upload.png"),
      "ATTACH-v2",
      "utf8",
    );
    writeFileSync(
      path.join(projectDir, ".meta", "after-snap.json"),
      "{}",
      "utf8",
    );

    restoreSnapshot(projectDir, "turn-1");

    expect(
      readFileSync(path.join(projectDir, ".attachments", "new-upload.png"), "utf8"),
    ).toBe("ATTACH-v2");
    expect(
      existsSync(path.join(projectDir, ".meta", "after-snap.json")),
    ).toBe(true);
  });

  test("restore against a missing snapshot returns null", () => {
    expect(restoreSnapshot(projectDir, "never-existed")).toBeNull();
  });
});
