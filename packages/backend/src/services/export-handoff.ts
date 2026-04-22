import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type LaunchOptions } from "playwright-core";

export class HandoffExportError extends Error {
  readonly code:
    | "chromium_not_installed"
    | "artifact_not_ready"
    | "render_failed";

  constructor(code: HandoffExportError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

/** Properties bundled for every data-bg-node-id element. */
export const HANDOFF_STYLE_KEYS = [
  "display",
  "position",
  "top",
  "left",
  "width",
  "height",
  "padding",
  "margin",
  "border",
  "border-radius",
  "background",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align",
] as const;

export interface HandoffNode {
  bg_id: string;
  tag: string;
  parent_bg_id: string | null;
  text: string;
  rect: { x: number; y: number; w: number; h: number };
  styles: Partial<Record<(typeof HANDOFF_STYLE_KEYS)[number], string>>;
}

export interface HandoffPage {
  slide_index: number | null;
  title: string;
  rect: { w: number; h: number };
  nodes: HandoffNode[];
}

export interface HandoffSpec {
  spec_version: 1;
  generated_at: number;
  project: {
    id: string;
    name: string;
    type: "prototype" | "slide_deck" | "from_template" | "other";
    entrypoint: string;
  };
  viewport: { width: number; height: number };
  design_system: {
    name: string | null;
    tokens_file: string | null; // relative path inside the zip
  };
  pages: HandoffPage[];
}

/**
 * Pure assembler — takes the raw `page.evaluate` payload and the project
 * metadata, returns a `HandoffSpec`. Split out so tests can exercise it
 * without launching chromium.
 */
export function buildHandoffSpec(input: {
  project: HandoffSpec["project"];
  viewport: { width: number; height: number };
  pages: HandoffPage[];
  designSystem: { name: string | null; tokensFileInZip: string | null };
  generatedAt?: number;
}): HandoffSpec {
  return {
    spec_version: 1,
    generated_at: input.generatedAt ?? Date.now(),
    project: input.project,
    viewport: input.viewport,
    design_system: {
      name: input.designSystem.name,
      tokens_file: input.designSystem.tokensFileInZip,
    },
    pages: input.pages,
  };
}

/**
 * Runs inside the browser. Extracts every `data-bg-node-id` element's
 * geometry + styles + text + parent linkage. For slide-decks, groups
 * into one page per `[data-slide]` with rects relative to the slide.
 * For non-deck artifacts, returns a single page containing the whole
 * document with rects relative to the viewport.
 */
export const EXTRACT_HANDOFF_FN = `() => {
  const STYLE_KEYS = ${JSON.stringify(HANDOFF_STYLE_KEYS)};

  function styleSubset(el) {
    const cs = window.getComputedStyle(el);
    const out = {};
    for (const key of STYLE_KEYS) {
      out[key] = cs.getPropertyValue(key).trim();
    }
    return out;
  }

  function directText(el) {
    const parts = [];
    for (const child of el.childNodes) {
      if (child.nodeType === 3 && child.textContent) {
        parts.push(child.textContent);
      }
    }
    return parts.join("").replace(/\\s+/g, " ").trim();
  }

  function parentBgId(el, root) {
    let cur = el.parentElement;
    while (cur && cur !== root) {
      const id = cur.getAttribute && cur.getAttribute("data-bg-node-id");
      if (id) return id;
      cur = cur.parentElement;
    }
    return null;
  }

  function extractNodes(root, relativeTo) {
    const baseRect = relativeTo.getBoundingClientRect();
    const out = [];
    const els = root.querySelectorAll("[data-bg-node-id]");
    els.forEach((el) => {
      const rect = el.getBoundingClientRect();
      out.push({
        bg_id: el.getAttribute("data-bg-node-id") || "",
        tag: el.tagName.toLowerCase(),
        parent_bg_id: parentBgId(el, relativeTo),
        text: directText(el),
        rect: {
          x: Math.round((rect.left - baseRect.left) * 100) / 100,
          y: Math.round((rect.top - baseRect.top) * 100) / 100,
          w: Math.round(rect.width * 100) / 100,
          h: Math.round(rect.height * 100) / 100,
        },
        styles: styleSubset(el),
      });
    });
    return out;
  }

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const slides = document.querySelectorAll("[data-slide]");
  if (slides.length > 0) {
    return {
      viewport,
      pages: Array.from(slides).map((slide, i) => {
        const rect = slide.getBoundingClientRect();
        return {
          slide_index: i,
          title: "Slide " + (i + 1),
          rect: {
            w: Math.round(rect.width * 100) / 100,
            h: Math.round(rect.height * 100) / 100,
          },
          nodes: extractNodes(slide, slide),
        };
      }),
    };
  }
  const rootRect = document.documentElement.getBoundingClientRect();
  return {
    viewport,
    pages: [{
      slide_index: null,
      title: "Page",
      rect: {
        w: Math.round(rootRect.width * 100) / 100,
        h: Math.round(rootRect.height * 100) / 100,
      },
      nodes: extractNodes(document, document.documentElement),
    }],
  };
}`;

/**
 * Renders a project's handoff zip. `stagedArtifactPath` is the on-disk
 * HTML we navigate to (file://), `stagingDir` is the temp dir we'll
 * populate with the final bundle contents before the caller zips it.
 */
export async function renderHandoffBundle(input: {
  stagedArtifactPath: string;
  stagingDir: string;
  entrypoint: string;
  tokensSrcPath: string | null;
  tokensFileName: string | null;
  designSystemName: string | null;
  project: HandoffSpec["project"];
  isDeck: boolean;
}): Promise<void> {
  const browser = await launchChromium();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    const fileUrl = pathToFileURL(input.stagedArtifactPath).toString();
    const url = input.isDeck ? `${fileUrl}?print=1` : fileUrl;

    try {
      await page.goto(url, { waitUntil: "networkidle" });
    } catch (err) {
      throw new HandoffExportError(
        "render_failed",
        `Failed to load artifact: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (input.isDeck) {
      try {
        await page.waitForFunction(
          () => document.body?.hasAttribute("data-deck-ready") === true,
          undefined,
          { timeout: 10_000 },
        );
      } catch {
        throw new HandoffExportError(
          "artifact_not_ready",
          "deck-stage runtime never signalled data-deck-ready — deck layout may be malformed.",
        );
      }
      // Same override CSS as PDF/PPTX so every slide paints.
      await page.addStyleTag({
        content:
          "[data-deck-nav],[data-deck-nav-style]{display:none!important}[data-slide]{display:block!important}",
      });
    }

    let raw: { viewport: { width: number; height: number }; pages: HandoffPage[] };
    try {
      raw = (await page.evaluate(EXTRACT_HANDOFF_FN)) as typeof raw;
    } catch (err) {
      throw new HandoffExportError(
        "render_failed",
        `Handoff extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const tokensFileInZip =
      input.tokensSrcPath && input.tokensFileName
        ? `tokens/${input.tokensFileName}`
        : null;

    const spec = buildHandoffSpec({
      project: input.project,
      viewport: raw.viewport,
      pages: raw.pages,
      designSystem: {
        name: input.designSystemName,
        tokensFileInZip,
      },
    });

    // Lay out the bundle root:
    //   <stagingDir>/
    //     <entrypoint>
    //     spec.json
    //     tokens/<tokens file>    (only if a design system is linked)
    //     README.txt
    await mkdir(input.stagingDir, { recursive: true });
    const entrypointDest = path.join(input.stagingDir, input.entrypoint);
    await mkdir(path.dirname(entrypointDest), { recursive: true });
    await copyFile(input.stagedArtifactPath, entrypointDest);

    await writeFile(
      path.join(input.stagingDir, "spec.json"),
      JSON.stringify(spec, null, 2),
      "utf8",
    );

    if (input.tokensSrcPath && tokensFileInZip) {
      const dest = path.join(input.stagingDir, tokensFileInZip);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(input.tokensSrcPath, dest).catch(() => {
        // tokens file missing on disk — skip rather than fail the whole export
      });
    }

    await writeFile(
      path.join(input.stagingDir, "README.txt"),
      README.trim(),
      "utf8",
    );
  } finally {
    await browser.close();
  }
}

const README = `
BurnGuard Handoff bundle
========================

Layout:
  <entrypoint>      The source HTML artifact as seen on screen.
  spec.json         Machine-readable description: one entry per
                    [data-bg-node-id] with computed styles + rect.
                    Deck artifacts are split per slide.
  tokens/           Copy of the design system's tokens CSS (when
                    the project is linked to a design system).
  README.txt        You are here.

spec.json top level:
  spec_version, generated_at, project, viewport, design_system, pages
Each page has: slide_index, title, rect, nodes[]
Each node has: bg_id, tag, parent_bg_id, text, rect (page-local), styles

This bundle is framework-agnostic. A reader can reconstruct the
layout by absolute-positioning each node at its rect with the
listed styles — the rect is relative to the page's own rect.
`;

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
  throw new HandoffExportError(
    "chromium_not_installed",
    [
      "No Chromium-compatible browser available for Handoff export.",
      "Install one of:",
      "  - `npx playwright install chromium`",
      "  - Google Chrome (channel=chrome)",
      "  - Microsoft Edge (channel=msedge)",
      "",
      ...errors.map((e, i) => `  [${i}] ${e}`),
    ].join("\n"),
  );
}

// Silence unused-import warning — `stat` is kept for future extensions
// that want to validate the staged artifact before rendering.
void stat;
