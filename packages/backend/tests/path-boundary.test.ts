import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  PathBoundaryError,
  assertSafeName,
  resolveWithin,
} from "../src/security/path-boundary";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveWithin", () => {
  test("resolves a contained existing path", () => {
    const root = makeTempDir("bg-path-root-");
    const child = path.join(root, "child");
    mkdirSync(child);

    expect(resolveWithin(root, "child")).toBe(child);
  });

  test("rejects parent traversal", () => {
    const root = makeTempDir("bg-path-root-");
    expect(() => resolveWithin(root, "..", "victim.txt")).toThrow(
      PathBoundaryError,
    );
  });

  test("rejects an absolute path segment", () => {
    const root = makeTempDir("bg-path-root-");
    const outside = makeTempDir("bg-path-outside-");
    expect(() => resolveWithin(root, outside)).toThrow(PathBoundaryError);
  });

  test("rejects backslash traversal on Windows", () => {
    if (process.platform !== "win32") return;
    const root = makeTempDir("bg-path-root-");
    expect(() => resolveWithin(root, "..\\victim.txt")).toThrow(
      PathBoundaryError,
    );
  });

  test("allows a not-yet-existing leaf below an existing root", () => {
    const root = makeTempDir("bg-path-root-");
    expect(resolveWithin(root, "new", "artifact.zip")).toBe(
      path.join(root, "new", "artifact.zip"),
    );
  });

  test("rejects an escape through a junction or symlink", () => {
    const root = makeTempDir("bg-path-root-");
    const outside = makeTempDir("bg-path-outside-");
    const link = path.join(root, "linked");
    symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");

    expect(() => resolveWithin(root, "linked", "victim.txt")).toThrow(
      PathBoundaryError,
    );
  });
});

describe("assertSafeName", () => {
  test("returns a safe single path component", () => {
    expect(assertSafeName("project-01_abc")).toBe("project-01_abc");
  });

  test.each(["", "..", "../victim", "..\\victim", "C:relative", "NUL"])(
    "rejects unsafe component %p",
    (name) => {
      expect(() => assertSafeName(name)).toThrow(PathBoundaryError);
    },
  );
});
