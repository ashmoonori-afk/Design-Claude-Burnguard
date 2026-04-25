import path from "node:path";
import { pathToFileURL } from "node:url";
import PptxGenJS from "pptxgenjs";
import { chromium, type Browser, type LaunchOptions } from "playwright-core";
import type { PptxSize } from "@bg/shared";

interface PptxLayoutDims {
  name: string;
  width: number; // inches
  height: number; // inches
}

export function pptxLayoutForSize(size: PptxSize): PptxLayoutDims {
  switch (size) {
    case "4x3":
      // Standard PowerPoint 4:3 layout = 10in × 7.5in.
      return { name: "BG_4x3", width: 10, height: 7.5 };
    case "16x9":
    default:
      // 16:9 widescreen = 10in × 5.625in (PptxGenJS default ratio).
      return { name: "BG_16x9", width: 10, height: 5.625 };
  }
}

export class PptxExportError extends Error {
  readonly code: "chromium_not_installed" | "deck_not_ready" | "render_failed";

  constructor(code: PptxExportError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

interface ExtractedText {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSizePx: number;
  fontFamily: string;
  color: string; // hex without leading '#'
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right" | "justify";
}

interface ExtractedSlide {
  width: number;
  height: number;
  background: string | null; // hex without leading '#'
  text: ExtractedText[];
}

/**
 * Runs inside the Playwright browser context — defined here so the static
 * text is what gets serialized into `page.evaluate`. Walks each
 * `[data-slide]` subtree collecting elements that contain a direct text
 * node (i.e. the paragraph/heading that actually paints glyphs rather than
 * a layout wrapper). Returns slide-local coordinates in CSS pixels.
 */
export const EXTRACT_SLIDES_FN = `() => {
  const SLIDE_SELECTOR = "[data-slide]";

  function parseColor(str) {
    const m = /rgba?\\(([^)]+)\\)/.exec(str);
    if (!m) return null;
    const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
    if (parts.length < 3) return null;
    const [r, g, b, a] = parts;
    if (a != null && a < 0.01) return null;
    const hex = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
    return (hex(r) + hex(g) + hex(b)).toUpperCase();
  }

  function hasDirectText(el) {
    for (const child of el.childNodes) {
      if (child.nodeType === 3 && child.textContent && child.textContent.trim()) return true;
    }
    return false;
  }

  function firstFontFace(family) {
    return family
      .split(",")[0]
      .trim()
      .replace(/^['\"]|['\"]$/g, "");
  }

  function extractSlide(slide) {
    const rect = slide.getBoundingClientRect();
    const slideView = window.getComputedStyle(slide);
    const bodyView = window.getComputedStyle(document.body);
    const bg =
      parseColor(slideView.backgroundColor) ||
      parseColor(bodyView.backgroundColor);

    const text = [];
    const stack = [slide];
    while (stack.length) {
      const el = stack.shift();
      const cs = window.getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) {
        continue;
      }
      if (hasDirectText(el)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          const rawText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent)
            .join("")
            .replace(/\\s+/g, " ")
            .trim();
          if (rawText) {
            const weight = parseInt(cs.fontWeight, 10) || 400;
            text.push({
              text: rawText,
              x: r.left - rect.left,
              y: r.top - rect.top,
              w: r.width,
              h: r.height,
              fontSizePx: parseFloat(cs.fontSize) || 16,
              fontFamily: firstFontFace(cs.fontFamily || "sans-serif"),
              color: parseColor(cs.color) || "111111",
              bold: weight >= 600,
              italic: cs.fontStyle === "italic",
              align: ["left", "right", "center", "justify"].includes(cs.textAlign)
                ? cs.textAlign
                : "left",
            });
          }
        }
      }
      for (const child of el.children) stack.push(child);
    }

    return {
      width: rect.width,
      height: rect.height,
      background: bg,
      text,
    };
  }

  const slides = Array.from(document.querySelectorAll(SLIDE_SELECTOR));
  return slides.map(extractSlide);
}`;

const PRINT_ALL_SLIDES_CSS = `
[data-deck-nav], [data-deck-nav-style] { display: none !important; }
[data-slide] { display: block !important; }
`;

export async function renderDeckToPptx(input: {
  stagedDir: string;
  entrypoint: string;
  outputPath: string;
  /** Defaults to 16:9 widescreen — preserves prior behavior. */
  size?: PptxSize;
}): Promise<void> {
  const browser = await launchChromium();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    const htmlPath = path.join(input.stagedDir, input.entrypoint);
    const fileUrl = pathToFileURL(htmlPath).toString();

    try {
      await page.goto(`${fileUrl}?print=1`, { waitUntil: "networkidle" });
    } catch (err) {
      throw new PptxExportError(
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
      throw new PptxExportError(
        "deck_not_ready",
        "deck-stage runtime never signalled data-deck-ready — deck may be missing [data-slide] elements or the runtime script failed to load.",
      );
    }

    await page.addStyleTag({ content: PRINT_ALL_SLIDES_CSS });

    let extracted: ExtractedSlide[];
    try {
      extracted = (await page.evaluate(EXTRACT_SLIDES_FN)) as ExtractedSlide[];
    } catch (err) {
      throw new PptxExportError(
        "render_failed",
        `slide extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      await writePptx(extracted, input.outputPath, input.size ?? "16x9");
    } catch (err) {
      throw new PptxExportError(
        "render_failed",
        `pptx write failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } finally {
    await browser.close();
  }
}

/**
 * Builds a PptxGenJS presentation from the extracted slide content and writes
 * it to `outputPath`. Separated from the rendering pipeline so `writePptx`
 * can be unit-tested against hand-crafted extracts.
 */
export async function writePptx(
  slides: ExtractedSlide[],
  outputPath: string,
  size: PptxSize = "16x9",
): Promise<void> {
  const layout = pptxLayoutForSize(size);
  const SLIDE_W_IN = layout.width;
  const SLIDE_H_IN = layout.height;

  const pres = new PptxGenJS();
  pres.defineLayout({
    name: layout.name,
    width: SLIDE_W_IN,
    height: SLIDE_H_IN,
  });
  pres.layout = layout.name;

  for (const slide of slides) {
    const pSlide = pres.addSlide();
    if (slide.background) {
      pSlide.background = { color: slide.background };
    }

    if (!slide.width || !slide.height) continue;

    for (const t of slide.text) {
      const xIn = (t.x / slide.width) * SLIDE_W_IN;
      const yIn = (t.y / slide.height) * SLIDE_H_IN;
      const wIn = (t.w / slide.width) * SLIDE_W_IN;
      const hIn = (t.h / slide.height) * SLIDE_H_IN;
      // Clamp into the slide so negative bleeds don't land outside the canvas.
      if (wIn <= 0 || hIn <= 0) continue;

      pSlide.addText(t.text, {
        x: clamp(xIn, 0, SLIDE_W_IN),
        y: clamp(yIn, 0, SLIDE_H_IN),
        w: clamp(wIn, 0.1, SLIDE_W_IN),
        h: clamp(hIn, 0.1, SLIDE_H_IN),
        fontSize: pxToPt(t.fontSizePx),
        fontFace: t.fontFamily,
        color: t.color,
        bold: t.bold,
        italic: t.italic,
        align: t.align,
        valign: "top",
        margin: 0,
      });
    }
  }

  await pres.writeFile({ fileName: outputPath });
}

function pxToPt(px: number): number {
  // CSS px → pt at 96dpi → 72pt/in. Round to 0.1pt.
  return Math.round(px * 0.75 * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

async function launchChromium(): Promise<Browser> {
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
  throw new PptxExportError(
    "chromium_not_installed",
    [
      "No Chromium-compatible browser is available for PPTX export.",
      "Install one of:",
      "  - `npx playwright install chromium` (recommended)",
      "  - Google Chrome (channel=chrome)",
      "  - Microsoft Edge (channel=msedge)",
      "",
      "Underlying errors:",
      ...errors.map((e, i) => `  [${i}] ${e}`),
    ].join("\n"),
  );
}
