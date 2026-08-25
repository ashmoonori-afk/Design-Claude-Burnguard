import { pathToFileURL } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { resolveWithin } from "../security/path-boundary";
import { registerExportBrowser } from "./export-browser-registry";

export type RenderViewport = { readonly width: number; readonly height: number; readonly dpr: 1 | 2 };
export type RenderFinding = { readonly code: "console_error" | "page_error" | "request_failed" | "remote_request" | "font_error"; readonly path: string | null };
export type RenderSession = { readonly browser: Browser; readonly context: BrowserContext; readonly page: Page; readonly findings: readonly RenderFinding[]; readonly close: () => Promise<void> };
export type RenderPhase = "browser_ready" | "navigated" | "content_ready";

export class RenderSessionError extends Error {
  readonly name = "RenderSessionError";
  constructor(readonly code: "chromium_not_installed" | "render_failed" | "deck_not_ready" | "render_aborted", message: string, readonly findings: readonly RenderFinding[] = []) { super(message); }
}

export async function openRenderSession(input: { readonly stagedDir: string; readonly entrypoint: string; readonly viewport: RenderViewport; readonly deck: boolean; readonly signal: AbortSignal; readonly onPhase?: (phase: RenderPhase) => void }): Promise<RenderSession> {
  if (input.signal.aborted) throw new RenderSessionError("render_aborted", "Render was cancelled");
  const browser = await launchChromium(input.signal); const owner = registerExportBrowser(() => browser.close()); const findings: RenderFinding[] = []; let abort: (() => void) | null = null;
  try {
    const context = await browser.newContext({ viewport: { width: input.viewport.width, height: input.viewport.height }, deviceScaleFactor: input.viewport.dpr }); const page = await context.newPage();
    page.on("console", (message) => { if (message.type() === "error") findings.push({ code: "console_error", path: message.text() }); });
    page.on("pageerror", (error) => findings.push({ code: "page_error", path: error.message })); page.on("requestfailed", (request) => findings.push({ code: "request_failed", path: request.url() }));
    await page.route("**/*", async (route) => { const url = new URL(route.request().url()); if (url.protocol === "file:" || url.protocol === "data:") await route.continue(); else { findings.push({ code: "remote_request", path: sanitizeUrl(url) }); await route.abort("blockedbyclient"); } });
    abort = (): void => { void browser.close(); }; input.signal.addEventListener("abort", abort, { once: true }); input.onPhase?.("browser_ready");
    const htmlPath = resolveWithin(input.stagedDir, input.entrypoint); await page.goto(`${pathToFileURL(htmlPath)}${input.deck ? "?print=1" : ""}`, { waitUntil: "load", timeout: 30_000 }); input.onPhase?.("navigated");
    await page.evaluate(async () => { if (document.readyState !== "complete") await new Promise<void>((resolve) => addEventListener("load", () => resolve(), { once: true })); await document.fonts.ready; });
    const state = await page.evaluate(() => {
      const fonts = [...document.fonts].filter((font) => font.status === "error").map((font) => font.family); const slides = [...document.querySelectorAll<HTMLElement>("[data-slide]")]; const sentinel = Reflect.get(globalThis, "__BURNGUARD_DECK_RUNTIME__"); const owned = typeof sentinel === "object" && sentinel !== null && Reflect.get(sentinel, "version") === 1 && Reflect.get(sentinel, "slideCount") === slides.length;
      const geometry = slides.every((slide) => { const previous = slide.style.cssText; slide.style.setProperty("display", "block", "important"); const rect = slide.getBoundingClientRect(); slide.style.cssText = previous; return Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width > 0 && rect.height > 0; }); return { fonts, slideCount: slides.length, owned, geometry };
    });
    for (const font of state.fonts) findings.push({ code: "font_error", path: font });
    if (input.deck && (state.slideCount === 0 || !state.owned || !state.geometry)) throw new RenderSessionError("deck_not_ready", "Owned deck runtime did not produce finite slide geometry", findings);
    if (findings.length > 0) throw new RenderSessionError("render_failed", "Render emitted browser errors", findings); input.onPhase?.("content_ready"); let closed = false;
    return { browser, context, page, findings, close: async () => { if (closed) return; closed = true; if (abort !== null) input.signal.removeEventListener("abort", abort); owner.release(); await browser.close(); } };
  } catch (error) {
    if (abort !== null) input.signal.removeEventListener("abort", abort); owner.release(); await browser.close().catch((closeError) => { if (!(error instanceof Error)) throw closeError; });
    if (input.signal.aborted) throw new RenderSessionError("render_aborted", "Render was cancelled", findings); if (error instanceof RenderSessionError) throw error; throw new RenderSessionError("render_failed", error instanceof Error ? error.message : String(error), findings);
  }
}

async function launchChromium(signal: AbortSignal): Promise<Browser> {
  const errors: string[] = [];
  for (const options of [{ headless: true }, { headless: true, channel: "chrome" }, { headless: true, channel: "msedge" }] as const) { if (signal.aborted) throw new RenderSessionError("render_aborted", "Render was cancelled"); try { return await chromium.launch(options); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); } }
  throw new RenderSessionError("chromium_not_installed", errors.join("\n"));
}
function sanitizeUrl(url: URL): string { return `${url.protocol}//${url.host}${url.pathname}`; }
