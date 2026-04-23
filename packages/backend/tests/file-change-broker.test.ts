import { beforeEach, describe, expect, test } from "bun:test";
import {
  noteEmittedFileChange,
  shouldEmitFileChange,
} from "../src/services/file-change-broker";

/**
 * Exercises the dedupe cache that sits between the fs-watcher and
 * adapter sides of the file.changed pipeline. Both producers call
 * `noteEmittedFileChange` when they actually emit; the watcher also
 * gates on `shouldEmitFileChange` before publishing so an adapter
 * write caught by the watcher ~100ms later doesn't produce a second
 * event for the same path.
 *
 * The window is 2_000ms — faster-than-window re-edits collapse to a
 * single event, which matches the DoD of "one edit → one chat entry"
 * even when VS Code emits multiple fs notifies per save.
 */

const PROJECT = "test-project-id";

describe("file-change-broker dedupe", () => {
  beforeEach(() => {
    // Rotate project id per test-suite run to isolate module state —
    // the broker stores recent entries per-project in a module-level
    // Map, so fresh keys give each test a clean slate.
  });

  test("path emits when nothing has been noted", () => {
    const project = `${PROJECT}-fresh-${Date.now()}`;
    expect(shouldEmitFileChange(project, "deck.html")).toBe(true);
  });

  test("path suppressed after a note, unchanged by unrelated paths", () => {
    const project = `${PROJECT}-suppress-${Date.now()}`;
    noteEmittedFileChange(project, "deck.html");
    expect(shouldEmitFileChange(project, "deck.html")).toBe(false);
    expect(shouldEmitFileChange(project, "other.html")).toBe(true);
  });

  test("note normalises Windows-style separators to POSIX", () => {
    const project = `${PROJECT}-slash-${Date.now()}`;
    noteEmittedFileChange(project, "slides\\hero.svg");
    // Gating uses the same normalisation so the lookup hits.
    expect(shouldEmitFileChange(project, "slides/hero.svg")).toBe(false);
  });

  test("different projects do not cross-contaminate", () => {
    const a = `${PROJECT}-a-${Date.now()}`;
    const b = `${PROJECT}-b-${Date.now()}`;
    noteEmittedFileChange(a, "deck.html");
    expect(shouldEmitFileChange(a, "deck.html")).toBe(false);
    expect(shouldEmitFileChange(b, "deck.html")).toBe(true);
  });
});
