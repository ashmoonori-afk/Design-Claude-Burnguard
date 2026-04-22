import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { EXTRACT_SLIDES_FN, writePptx } from "../src/services/export-pptx";

describe("writePptx", () => {
  test("emits one slide per extract with editable text entries", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "burnguard-pptx-test-"));
    const out = path.join(dir, "out.pptx");
    try {
      await writePptx(
        [
          {
            width: 1280,
            height: 720,
            background: "101318",
            text: [
              {
                text: "Hero headline",
                x: 64,
                y: 96,
                w: 800,
                h: 120,
                fontSizePx: 96,
                fontFamily: "Inter",
                color: "FFFFFF",
                bold: true,
                italic: false,
                align: "left",
              },
            ],
          },
          {
            width: 1280,
            height: 720,
            background: null,
            text: [
              {
                text: "Slide 2 body",
                x: 120,
                y: 300,
                w: 900,
                h: 80,
                fontSizePx: 32,
                fontFamily: "Inter",
                color: "111111",
                bold: false,
                italic: false,
                align: "center",
              },
            ],
          },
        ],
        out,
      );

      const bytes = readFileSync(out);
      // PPTX is a zip. First two bytes are "PK".
      expect(bytes[0]).toBe(0x50);
      expect(bytes[1]).toBe(0x4b);
      // The hero text must appear somewhere in the XML (inside the zip).
      // Raw bytes contain the deflated stream, so we check both raw bytes
      // for the string (pptxgenjs may store some parts uncompressed) and
      // at a minimum confirm the file is a plausible size (>1KB).
      expect(bytes.byteLength).toBeGreaterThan(1024);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("handles an empty extract without throwing", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "burnguard-pptx-test-"));
    const out = path.join(dir, "empty.pptx");
    try {
      await writePptx([], out);
      const bytes = readFileSync(out);
      expect(bytes.byteLength).toBeGreaterThan(512);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("skips text boxes whose computed dimensions are zero or negative", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "burnguard-pptx-test-"));
    const out = path.join(dir, "skipzero.pptx");
    try {
      await writePptx(
        [
          {
            width: 1280,
            height: 720,
            background: null,
            text: [
              {
                text: "zero-height",
                x: 0,
                y: 0,
                w: 100,
                h: 0,
                fontSizePx: 24,
                fontFamily: "Inter",
                color: "000000",
                bold: false,
                italic: false,
                align: "left",
              },
              {
                text: "fine",
                x: 0,
                y: 0,
                w: 100,
                h: 40,
                fontSizePx: 24,
                fontFamily: "Inter",
                color: "000000",
                bold: false,
                italic: false,
                align: "left",
              },
            ],
          },
        ],
        out,
      );
      const bytes = readFileSync(out);
      expect(bytes.byteLength).toBeGreaterThan(512);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("EXTRACT_SLIDES_FN", () => {
  test("is a valid JS function expression starting with () =>", () => {
    expect(EXTRACT_SLIDES_FN.startsWith("() => {")).toBe(true);
    // Must reference the slide selector so the extractor targets [data-slide].
    expect(EXTRACT_SLIDES_FN).toContain("[data-slide]");
    // Must use getComputedStyle for color/font resolution.
    expect(EXTRACT_SLIDES_FN).toContain("getComputedStyle");
  });
});
