import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type LaunchOptions } from "playwright-core";
import {
  DECK_TUTORIAL_HTML,
  PROTOTYPE_TUTORIAL_HTML,
  PROTOTYPE_TUTORIAL_NAME,
  DECK_TUTORIAL_NAME,
} from "../src/db/seed-tutorials";
import { DECK_STAGE_JS } from "../src/runtime/deck-stage";
import { PdfExportError, renderDeckToPdf } from "../src/services/export-pdf";
import { PptxExportError, renderDeckToPptx } from "../src/services/export-pptx";

describe("tutorial HTML contracts", () => {
  test("prototype tutorial is a standalone page with editable anchors", () => {
    expect(PROTOTYPE_TUTORIAL_HTML).toContain("<!doctype html>");
    expect(PROTOTYPE_TUTORIAL_HTML).toContain('data-bg-node-id="headline"');
    expect(PROTOTYPE_TUTORIAL_HTML).toContain('data-bg-node-id="body"');
    // No external scripts/fonts — offline export must work verbatim.
    expect(PROTOTYPE_TUTORIAL_HTML).not.toMatch(/<link[^>]*href=["']https?:/);
    expect(PROTOTYPE_TUTORIAL_HTML).not.toMatch(/<script[^>]*src=["']https?:/);
  });

  test("deck tutorial exposes at least 3 [data-slide] sections with editable text", () => {
    const sectionMatches = DECK_TUTORIAL_HTML.match(/<section\s+data-slide/g) ?? [];
    expect(sectionMatches.length).toBeGreaterThanOrEqual(3);
    expect(DECK_TUTORIAL_HTML).toContain('data-bg-node-id="slide-1-title"');
    expect(DECK_TUTORIAL_HTML).toContain('data-bg-node-id="slide-3-body"');
    // Runtime script is referenced — deck-stage.js will toggle data-active.
    expect(DECK_TUTORIAL_HTML).toMatch(/runtime\/deck-stage\.js/);
  });

  test("tutorial names carry the reserved prefix so seedTutorialsOnce can match", () => {
    expect(PROTOTYPE_TUTORIAL_NAME.startsWith("[burnguard:tutorial]")).toBe(true);
    expect(DECK_TUTORIAL_NAME.startsWith("[burnguard:tutorial]")).toBe(true);
  });
});

/**
 * Deck export pipeline smoke test. Stages the deck tutorial into a temp
 * dir the same way `prepareSlideDeckExport` would (deck-stage.js copied
 * alongside, runtime path rewritten to a relative file), then runs the
 * real PDF/PPTX renderers. Chromium-dependent — skipped with a warning if
 * no browser is available so the suite stays green on fresh checkouts.
 */
let chromiumAvailable = false;
const SMOKE_OPT_IN = process.env.BG_EXPORT_SMOKE === "1";

beforeAll(async () => {
  if (!SMOKE_OPT_IN) return;
  // Probe once so the chromium-dependent tests skip cleanly when no
  // browser is installed. Short per-candidate timeout caps the total
  // cost on a cold machine where channel detection stalls.
  const candidates: LaunchOptions[] = [
    { headless: true, timeout: 3_000 },
    { headless: true, channel: "chrome", timeout: 3_000 },
    { headless: true, channel: "msedge", timeout: 3_000 },
  ];
  for (const opts of candidates) {
    try {
      const browser = await chromium.launch(opts);
      await browser.close();
      chromiumAvailable = true;
      return;
    } catch {
      // try next candidate
    }
  }
}, 15_000);

describe("deck export smoke (chromium-gated)", () => {
  async function stageDeck() {
    const dir = await mkdtemp(path.join(tmpdir(), "burnguard-exports-test-"));
    await mkdir(path.join(dir, "runtime"), { recursive: true });
    await writeFile(
      path.join(dir, "runtime", "deck-stage.js"),
      DECK_STAGE_JS,
      "utf8",
    );
    const rewritten = DECK_TUTORIAL_HTML.replaceAll(
      "/runtime/deck-stage.js",
      "runtime/deck-stage.js",
    );
    await writeFile(path.join(dir, "deck.html"), rewritten, "utf8");
    return dir;
  }

  test("PDF: renderDeckToPdf produces a non-empty .pdf", async () => {
    if (!SMOKE_OPT_IN) {
      // eslint-disable-next-line no-console
      console.warn("[exports.test] skipping PDF smoke — set BG_EXPORT_SMOKE=1 to run");
      return;
    }
    if (!chromiumAvailable) {
      // eslint-disable-next-line no-console
      console.warn("[exports.test] skipping PDF smoke — no Chromium on PATH");
      return;
    }
    const dir = await stageDeck();
    const out = path.join(dir, "deck.pdf");
    try {
      await renderDeckToPdf({
        stagedDir: dir,
        entrypoint: "deck.html",
        outputPath: out,
      });
      const info = await stat(out);
      expect(info.size).toBeGreaterThan(1024);
    } catch (err) {
      if (err instanceof PdfExportError && err.code !== "render_failed") {
        // eslint-disable-next-line no-console
        console.warn(`[exports.test] skipping PDF smoke — ${err.code}`);
        return;
      }
      throw err;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  test("PPTX: renderDeckToPptx produces a non-empty .pptx", async () => {
    if (!SMOKE_OPT_IN) {
      // eslint-disable-next-line no-console
      console.warn("[exports.test] skipping PPTX smoke — set BG_EXPORT_SMOKE=1 to run");
      return;
    }
    if (!chromiumAvailable) {
      // eslint-disable-next-line no-console
      console.warn("[exports.test] skipping PPTX smoke — no Chromium on PATH");
      return;
    }
    const dir = await stageDeck();
    const out = path.join(dir, "deck.pptx");
    try {
      await renderDeckToPptx({
        stagedDir: dir,
        entrypoint: "deck.html",
        outputPath: out,
      });
      const info = await stat(out);
      expect(info.size).toBeGreaterThan(1024);
    } catch (err) {
      if (err instanceof PptxExportError && err.code !== "render_failed") {
        // eslint-disable-next-line no-console
        console.warn(`[exports.test] skipping PPTX smoke — ${err.code}`);
        return;
      }
      throw err;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
