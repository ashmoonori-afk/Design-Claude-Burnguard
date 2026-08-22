import { describe, expect, test } from "bun:test";
import { isTransientFilePath } from "../src/services/files";
import * as watchers from "../src/services/watchers";

describe("project watcher path filtering", () => {
  test("ignores atomic-write temporary artifacts", () => {
    const shouldSkipPath = (
      watchers as typeof watchers & {
        shouldSkipPath?: (relPath: string) => boolean;
      }
    ).shouldSkipPath;

    expect(typeof shouldSkipPath).toBe("function");
    if (!shouldSkipPath) return;

    expect(shouldSkipPath(".index.html.123.456.tmp")).toBe(true);
    expect(shouldSkipPath("index.html")).toBe(false);
    expect(isTransientFilePath(".index.html.123.456.tmp")).toBe(true);
    expect(isTransientFilePath("nested/index.html")).toBe(false);
  });
});
