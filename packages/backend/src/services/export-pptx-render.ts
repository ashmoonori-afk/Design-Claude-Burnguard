import type { PptxSize } from "@bg/shared";
import { EXTRACT_SLIDES_FN, PptxExportError, writePptx, type ExtractedSlide } from "./export-pptx";

const PRINT_ALL_SLIDES_CSS = "[data-deck-nav],[data-deck-nav-style]{display:none!important}[data-slide]{display:block!important}";

export async function renderDeckToPptx(input: {
  readonly stagedDir: string;
  readonly entrypoint: string;
  readonly outputPath: string;
  readonly size?: PptxSize;
  readonly signal?: AbortSignal;
}): Promise<void> {
  const signal = input.signal ?? new AbortController().signal;
  const { openRenderSession, RenderSessionError } = await import("./export-render-session");
  let session;
  try { session = await openRenderSession({ stagedDir: input.stagedDir, entrypoint: input.entrypoint, viewport: { width: 1280, height: 720, dpr: 1 }, deck: true, signal }); }
  catch (error) { if (error instanceof RenderSessionError) throw new PptxExportError(error.code === "deck_not_ready" ? "deck_not_ready" : error.code === "chromium_not_installed" ? "chromium_not_installed" : error.code === "chromium_launch_timeout" ? "chromium_launch_timeout" : "render_failed", error.message); throw error; }
  try {
    const page = session.page; await page.addStyleTag({ content: PRINT_ALL_SLIDES_CSS });
    const value: unknown = await page.evaluate(`(${EXTRACT_SLIDES_FN})()`);
    if (!Array.isArray(value) || !value.every(isExtractedSlide)) throw new PptxExportError("render_failed", "Slide extraction returned invalid slides");
    await writePptx(value, input.outputPath, input.size ?? "16x9");
  } finally { await session.close(); }
}
function isExtractedSlide(value: unknown): value is ExtractedSlide { return typeof value === "object" && value !== null && Reflect.has(value, "width") && Reflect.has(value, "height") && Reflect.has(value, "text"); }
