import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type LaunchOptions } from "playwright-core";
import type { PdfPaper } from "@bg/shared";

export class PdfExportError extends Error {
  readonly code: "chromium_not_installed" | "deck_not_ready" | "render_failed";

  constructor(code: PdfExportError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * CSS injected by Playwright before `page.pdf()`. Overrides the slide-deck
 * template's `data-deck-ready` single-slide gate so every `<section data-slide>`
 * renders, each on its own page, with no nav-bar artifact.
 *
 * Note: no `@page { size: ... }` rule here. Page dimensions are now
 * driven entirely by the `paper` option below so the user can pick
 * A4 / Letter / 16:9 widescreen without recompiling.
 */
export const PDF_PRINT_CSS = `
html, body {
  margin: 0 !important;
  padding: 0 !important;
  background: #ffffff !important;
}
[data-deck-nav], [data-deck-nav-style] { display: none !important; }
[data-slide] {
  display: block !important;
  page-break-after: always;
  break-after: page;
  page-break-inside: avoid;
  break-inside: avoid;
}
[data-slide]:last-of-type {
  page-break-after: auto;
  break-after: auto;
}
`;

interface PdfPageDimensions {
  format?: "A4" | "Letter";
  width?: string;
  height?: string;
}

export function pdfDimensionsForPaper(paper: PdfPaper): PdfPageDimensions {
  switch (paper) {
    case "letter":
      return { format: "Letter" };
    case "widescreen-16x9":
      // A real 16:9 frame so screen-shaped decks fill every PDF page
      // without margins, instead of being letterboxed onto A4.
      return { width: "13.333in", height: "7.5in" };
    case "a4":
    default:
      return { format: "A4" };
  }
}

export async function renderDeckToPdf(input: {
  stagedDir: string;
  entrypoint: string;
  outputPath: string;
  /** Defaults to A4 when omitted — preserves prior behavior. */
  paper?: PdfPaper;
}): Promise<void> {
  const browser = await launchChromium();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const htmlPath = path.join(input.stagedDir, input.entrypoint);
    const fileUrl = pathToFileURL(htmlPath).toString();

    try {
      await page.goto(`${fileUrl}?print=1`, { waitUntil: "networkidle" });
    } catch (err) {
      throw new PdfExportError(
        "render_failed",
        `Failed to load deck ${htmlPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      await page.waitForFunction(
        () => document.body?.hasAttribute("data-deck-ready") === true,
        undefined,
        { timeout: 10_000 },
      );
    } catch {
      throw new PdfExportError(
        "deck_not_ready",
        "deck-stage runtime never signalled data-deck-ready — deck may be missing [data-slide] elements or the runtime script failed to load.",
      );
    }

    await page.addStyleTag({ content: PDF_PRINT_CSS });

    try {
      const dims = pdfDimensionsForPaper(input.paper ?? "a4");
      await page.pdf({
        path: input.outputPath,
        format: dims.format,
        width: dims.width,
        height: dims.height,
        // Decks are inherently landscape; only A4 / Letter actually
        // need the flag. The 16:9 widescreen path uses explicit width
        // / height so `landscape` is moot for it.
        landscape: dims.format !== undefined,
        printBackground: true,
        // Never let the document's CSS @page rules override the chosen
        // paper. We strip @page from PDF_PRINT_CSS but the user's deck
        // could still ship its own @page rule.
        preferCSSPageSize: false,
      });
    } catch (err) {
      throw new PdfExportError(
        "render_failed",
        `page.pdf() failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } finally {
    await browser.close();
  }
}

async function launchChromium(): Promise<Browser> {
  // Try the playwright-managed install first, then system Chrome, then Edge.
  // None installed → throw a typed error so the route layer can surface a
  // "install via Settings" hint (P2.9).
  const candidates: LaunchOptions[] = [
    { headless: true },
    { headless: true, channel: "chrome" },
    { headless: true, channel: "msedge" },
  ];
  const errors: string[] = [];
  for (const opts of candidates) {
    try {
      return await chromium.launch(opts);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new PdfExportError(
    "chromium_not_installed",
    [
      "No Chromium-compatible browser is available for PDF export.",
      "Install one of:",
      "  - `npx playwright install chromium` (recommended)",
      "  - Google Chrome (will be picked up via channel=chrome)",
      "  - Microsoft Edge (will be picked up via channel=msedge)",
      "",
      "Underlying errors:",
      ...errors.map((e, i) => `  [${i}] ${e}`),
    ].join("\n"),
  );
}
