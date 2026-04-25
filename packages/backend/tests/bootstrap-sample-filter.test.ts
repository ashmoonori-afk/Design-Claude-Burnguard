import { describe, expect, test } from "bun:test";
import { isSampleSourcePathAllowed } from "../src/bootstrap";

describe("isSampleSourcePathAllowed", () => {
  test("allows the source root", () => {
    expect(isSampleSourcePathAllowed("")).toBe(true);
    expect(isSampleSourcePathAllowed(".")).toBe(true);
  });

  test("allows top-level sample DS files and folders", () => {
    expect(isSampleSourcePathAllowed("README.md")).toBe(true);
    expect(isSampleSourcePathAllowed("SKILL.md")).toBe(true);
    expect(isSampleSourcePathAllowed("colors_and_type.css")).toBe(true);
    expect(isSampleSourcePathAllowed("assets")).toBe(true);
    expect(isSampleSourcePathAllowed("preview/colors-brand.html")).toBe(true);
    expect(isSampleSourcePathAllowed("ui_kits/website/Header.jsx")).toBe(true);
  });

  test("blocks the uploads folder and everything inside it", () => {
    expect(isSampleSourcePathAllowed("uploads")).toBe(false);
    expect(isSampleSourcePathAllowed("uploads/SECRET.pptx")).toBe(false);
    expect(isSampleSourcePathAllowed("uploads/.gitkeep")).toBe(false);
    expect(isSampleSourcePathAllowed("uploads/sub/file.pdf")).toBe(false);
  });

  test("uses path-segment matching, not substring matching", () => {
    // A future folder named "uploads_archive" or "my_uploads" must not
    // be caught by the rule. Substring matching ("uploads") would falsely
    // skip these.
    expect(isSampleSourcePathAllowed("uploads_archive")).toBe(true);
    expect(isSampleSourcePathAllowed("uploads_archive/foo.png")).toBe(true);
    expect(isSampleSourcePathAllowed("my_uploads")).toBe(true);
  });

  test("normalises Windows backslash separators", () => {
    expect(isSampleSourcePathAllowed("uploads\\SECRET.pptx")).toBe(false);
    expect(isSampleSourcePathAllowed("uploads\\sub\\file.pdf")).toBe(false);
    expect(isSampleSourcePathAllowed("preview\\colors-brand.html")).toBe(true);
  });
});
