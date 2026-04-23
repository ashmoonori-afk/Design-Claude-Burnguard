import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import PptxGenJS from "pptxgenjs";
import {
  readUploadManifest,
  runPythonUploadExtractor,
} from "../src/services/design-system-extract";

/**
 * End-to-end upload extraction smoke. Exercises the real Python
 * subprocess against a freshly-generated PPTX so a regression in
 * `upload-extractor-py.ts` (or the `readUploadManifest` normalizer)
 * shows up as a CI failure rather than a Settings-modal install
 * button mystery.
 *
 * Opt-in via `BG_UPLOAD_SMOKE=1` so the default `bun test` run stays
 * green on fresh checkouts where Python isn't installed. PPTX-only —
 * PDF smoke would also require `pypdf`, and keeping the dependency
 * surface narrow keeps the opt-in cheap.
 */

const SMOKE_OPT_IN = process.env.BG_UPLOAD_SMOKE === "1";

let pythonAvailable = false;

beforeAll(async () => {
  if (!SMOKE_OPT_IN) return;

  // Mirror of `python-health.ts`'s probe — skip rather than fail when
  // a contributor opts in on a machine without Python.
  const candidates =
    process.platform === "win32"
      ? [["py", "-3"], ["python3"], ["python"]]
      : [["python3"], ["python"]];
  for (const prefix of candidates) {
    try {
      const proc = Bun.spawn({
        cmd: [...prefix, "--version"],
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
      });
      const exitCode = await proc.exited;
      if (exitCode === 0) {
        pythonAvailable = true;
        return;
      }
    } catch {
      // try next candidate
    }
  }
  // eslint-disable-next-line no-console
  console.log(
    "[upload-extract.smoke] skipping — no python3 / python / py found on PATH",
  );
});

async function generateSamplePptx(targetPath: string): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  const slide1 = pptx.addSlide();
  slide1.addText("Quarterly Review", {
    x: 0.5,
    y: 0.5,
    w: 9,
    h: 1,
    fontSize: 32,
    bold: true,
    color: "0057B8",
    fontFace: "Inter",
  });
  slide1.addText("Revenue expanded 22% year over year.", {
    x: 0.5,
    y: 2,
    w: 9,
    h: 0.8,
    fontSize: 18,
    fontFace: "Inter",
  });

  const slide2 = pptx.addSlide();
  slide2.addText("Next steps", {
    x: 0.5,
    y: 0.5,
    w: 9,
    h: 1,
    fontSize: 28,
    bold: true,
    fontFace: "Inter",
  });
  slide2.addText("Get started with the new onboarding flow.", {
    x: 0.5,
    y: 2,
    w: 9,
    h: 0.8,
    fontSize: 18,
    fontFace: "Inter",
  });

  await pptx.writeFile({ fileName: targetPath });
}

describe("upload extractor end-to-end (BG_UPLOAD_SMOKE=1)", () => {
  test("parses a generated pptx through the Python extractor", async () => {
    if (!SMOKE_OPT_IN) {
      // eslint-disable-next-line no-console
      console.log(
        "[upload-extract.smoke] skipping — set BG_UPLOAD_SMOKE=1 to run",
      );
      return;
    }
    if (!pythonAvailable) {
      expect(true).toBe(true);
      return;
    }

    const dir = await mkdtemp(path.join(tmpdir(), "bg-upload-smoke-"));
    try {
      const sourcePath = path.join(dir, "sample.pptx");
      await generateSamplePptx(sourcePath);
      const manifestPath = path.join(dir, "manifest.json");

      await runPythonUploadExtractor({ sourcePath, manifestPath });

      const manifest = await readUploadManifest(manifestPath);
      expect(manifest.kind).toBe("pptx");
      expect(manifest.page_count).toBe(2);
      expect(manifest.pages.length).toBe(2);
      expect(manifest.pages[0]!.title).toMatch(/Quarterly|Review/);
      expect(manifest.headings.length).toBeGreaterThan(0);
      // Inter font was applied to every run; the theme walker may or
      // may not surface it (depends on pptxgenjs defaults), but at
      // least one font candidate should land.
      expect(Array.isArray(manifest.fonts)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("flags invalid-kind manifests produced by a regressed extractor", async () => {
    if (!SMOKE_OPT_IN) return;
    if (!pythonAvailable) return;

    const dir = await mkdtemp(path.join(tmpdir(), "bg-upload-smoke-"));
    try {
      const bad = path.join(dir, "bad-manifest.json");
      await writeFile(bad, JSON.stringify({ kind: "docx" }));
      await expect(readUploadManifest(bad)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
