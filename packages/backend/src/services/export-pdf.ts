import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type LaunchOptions } from "playwright-core";

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
 */
export const PDF_PRINT_CSS = `
@page { size: A4 landscape; margin: 0; }
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

export async function renderDeckToPdf(input: {
  stagedDir: string;
  entrypoint: string;
  outputPath: string;
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
      await page.pdf({
        path: input.outputPath,
        format: "A4",
        landscape: true,
        printBackground: true,
        preferCSSPageSize: true,
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
