import { describe, expect, test } from "bun:test";
import { resolveCanvasSource } from "../src/lib/canvas-source";

describe("resolveCanvasSource", () => {
  test("Given a stale active entrypoint and zero indexed files When resolved Then the empty canvas does not fetch the missing file", () => {
    const source = resolveCanvasSource({
      projectId: "project-1",
      activeRelPath: "index.html",
      indexedRelPaths: [],
      entrypointUrl: "/api/projects/project-1/fs/index.html",
    });

    expect(source).toBeNull();
  });

  test("Given an indexed nested active file When resolved Then its encoded project URL is returned", () => {
    const source = resolveCanvasSource({
      projectId: "project-1",
      activeRelPath: "sections/hero panel.html",
      indexedRelPaths: ["sections/hero panel.html"],
      entrypointUrl: null,
    });

    expect(source).toBe(
      "/api/projects/project-1/fs/sections/hero%20panel.html",
    );
  });

  test("Given a non-empty stale index and a newly generated active file When resolved Then the new file remains renderable", () => {
    const source = resolveCanvasSource({
      projectId: "project-1",
      activeRelPath: "generated/new deck.html",
      indexedRelPaths: ["index.html"],
      entrypointUrl: "/api/projects/project-1/fs/index.html",
    });

    expect(source).toBe(
      "/api/projects/project-1/fs/generated/new%20deck.html",
    );
  });

  test("Given an unavailable file index and an active file When resolved Then the existing canvas remains renderable", () => {
    const source = resolveCanvasSource({
      projectId: "project-1",
      activeRelPath: "index.html",
      indexedRelPaths: null,
      entrypointUrl: "/api/projects/project-1/fs/index.html",
    });

    expect(source).toBe("/api/projects/project-1/fs/index.html");
  });

  test("Given no active file When a valid artifact entrypoint exists Then the fallback remains available", () => {
    expect(
      resolveCanvasSource({
        projectId: "project-1",
        activeRelPath: null,
        indexedRelPaths: ["index.html"],
        entrypointUrl: "/api/projects/project-1/fs/index.html",
      }),
    ).toBe("/api/projects/project-1/fs/index.html");
  });
});
