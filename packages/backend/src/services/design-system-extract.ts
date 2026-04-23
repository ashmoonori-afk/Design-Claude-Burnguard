import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "node-html-parser";
import type {
  CreateDesignSystemExtractionRequest,
  CreateDesignSystemExtractionResponse,
  DesignSystemDetail,
  DesignSystemSourceType,
} from "@bg/shared";
import { createDesignSystemRecord, getDesignSystemDetail } from "../db/seed";
import { cacheDir, systemsDir } from "../lib/paths";

const PREVIEW_FILE_IDS = [
  "brand-logos",
  "brand-icons",
  "colors-brand",
  "colors-neutrals",
  "colors-ramps",
  "colors-semantic",
  "colors-charts",
  "type-display",
  "type-headings",
  "type-body",
  "spacing",
  "radii-shadows",
  "components-buttons",
  "components-cards",
  "components-forms",
  "components-badges-table",
] as const;

const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
]);

const TEXT_FILE_EXTENSIONS = new Set([
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".json",
  ".html",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".md",
]);

const UI_KIT_EXTENSIONS = new Set([".html", ".jsx", ".tsx", ".css"]);
const LOGO_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp"]);

type SupportedExtractionSource = Extract<DesignSystemSourceType, "github" | "website">;

interface SourceAnalysis {
  brandName: string;
  cssVars: Map<string, string>;
  fontFamilies: string[];
  notes: string[];
  logoFiles: Array<{ absolutePath: string; fileName: string }>;
  uiKitFiles: Array<{ absolutePath: string; fileName: string }>;
  rawFiles: string[];
  homepageHtml: string | null;
}

export class DesignSystemExtractError extends Error {
  constructor(
    readonly code:
      | "invalid_source_url"
      | "unsupported_source_type"
      | "git_clone_failed"
      | "website_fetch_failed"
      | "system_id_conflict",
    message: string,
  ) {
    super(message);
    this.name = "DesignSystemExtractError";
  }
}

export async function extractDesignSystemFromSource(
  input: CreateDesignSystemExtractionRequest,
): Promise<CreateDesignSystemExtractionResponse> {
  const sourceUrl = input.source_url?.trim();
  if (!sourceUrl) {
    throw new DesignSystemExtractError(
      "invalid_source_url",
      "source_url is required",
    );
  }

  const inferredSourceType = inferSourceType(sourceUrl);
  const sourceType = input.source_type ?? inferredSourceType;
  if (sourceType !== "github" && sourceType !== "website") {
    throw new DesignSystemExtractError(
      "unsupported_source_type",
      `Unsupported extraction source type: ${String(sourceType)}`,
    );
  }

  const tmpRoot = await mkdtemp(path.join(tmpdir(), "burnguard-ds-extract-"));
  try {
    const ingestDir = path.join(tmpRoot, "ingest");
    await mkdir(ingestDir, { recursive: true });
    const analysis =
      sourceType === "github"
        ? await ingestGitSource(sourceUrl, ingestDir, input.name)
        : await ingestWebsiteSource(sourceUrl, ingestDir, input.name);

    const brandName = input.name?.trim() || analysis.brandName;
    const systemId = await allocateSystemId(input.system_id ?? slugify(brandName));
    const systemDir = path.join(systemsDir, systemId);

    const generatedFiles = await writeCanonicalDesignSystem({
      systemDir,
      systemId,
      brandName,
      sourceType,
      sourceUrl,
      analysis,
    });

    const created = await createDesignSystemRecord({
      id: systemId,
      name: brandName,
      description: `${capitalize(sourceType)} extraction scaffold from ${sourceUrl}`,
      status: "draft",
      sourceType,
      sourceUri: sourceUrl,
      dirPath: systemDir,
      skillMdPath: path.join(systemDir, "SKILL.md"),
      tokensCssPath: path.join(systemDir, "colors_and_type.css"),
      readmeMdPath: path.join(systemDir, "README.md"),
      thumbnailPath: null,
    });
    if (!created) {
      throw new Error("createDesignSystemRecord returned null");
    }

    return {
      system: created satisfies DesignSystemDetail,
      extraction: {
        inferred_source_type: sourceType,
        brand_name: brandName,
        generated_files: generatedFiles,
        copied_logo_count: analysis.logoFiles.length,
        detected_css_var_count: analysis.cssVars.size,
        detected_font_family_count: analysis.fontFamilies.length,
        notes: analysis.notes,
      },
    };
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

export function inferSourceType(sourceUrl: string): SupportedExtractionSource {
  const trimmed = sourceUrl.trim();
  if (
    /^git@/i.test(trimmed) ||
    /^ssh:\/\//i.test(trimmed) ||
    /\.git(?:[#?].*)?$/i.test(trimmed)
  ) {
    return "github";
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") {
      const host = url.hostname.toLowerCase();
      if (
        host === "github.com" ||
        host === "www.github.com" ||
        host === "gitlab.com" ||
        host === "www.gitlab.com" ||
        host === "bitbucket.org" ||
        host === "www.bitbucket.org"
      ) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts.length >= 2) return "github";
      }
      return "website";
    }
  } catch {
    // fall through
  }
  throw new DesignSystemExtractError(
    "invalid_source_url",
    `Could not infer extraction source from "${sourceUrl}"`,
  );
}

export function extractCssCustomProperties(content: string): Map<string, string> {
  const out = new Map<string, string>();
  const regex = /--([a-zA-Z0-9-_]+)\s*:\s*([^;}{]+);/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content))) {
    out.set(match[1].trim(), match[2].trim());
  }
  return out;
}

function extractFontFamilies(content: string): string[] {
  const families = new Set<string>();
  const regex = /font-family\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content))) {
    const parts = match[1]
      .split(",")
      .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
    if (parts[0]) families.add(parts[0]);
  }
  return [...families];
}

async function ingestGitSource(
  sourceUrl: string,
  ingestDir: string,
  preferredName?: string,
): Promise<SourceAnalysis> {
  const repoDir = path.join(ingestDir, "repo");
  const proc = Bun.spawn({
    cmd: ["git", "clone", "--depth=1", sourceUrl, repoDir],
    stdout: "ignore",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new DesignSystemExtractError(
      "git_clone_failed",
      stderr.trim() || `git clone failed with exit code ${exitCode}`,
    );
  }

  const analysis = await analyzeLocalTree(
    repoDir,
    preferredName ?? deriveBrandNameFromGitUrl(sourceUrl),
  );
  analysis.notes.unshift("Raw source ingested from git clone.");
  analysis.rawFiles.push("uploads/source-url.txt", "uploads/extraction-report.json");
  return analysis;
}

async function ingestWebsiteSource(
  sourceUrl: string,
  ingestDir: string,
  preferredName?: string,
): Promise<SourceAnalysis> {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new DesignSystemExtractError(
      "invalid_source_url",
      `Invalid website URL: ${sourceUrl}`,
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DesignSystemExtractError(
      "invalid_source_url",
      `Website URL must be http(s): ${sourceUrl}`,
    );
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new DesignSystemExtractError(
      "website_fetch_failed",
      `Website fetch failed with HTTP ${response.status}`,
    );
  }
  const html = await response.text();
  const websiteDir = path.join(ingestDir, "website");
  const uploadsDir = path.join(websiteDir, "uploads", "linked-css");
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(websiteDir, "index.html"), html, "utf8");

  const root = parse(html);
  const cssVars = new Map<string, string>();
  const fontFamilies = new Set<string>();
  const notes: string[] = ["Homepage HTML fetched from website URL."];
  const logoFiles: Array<{ absolutePath: string; fileName: string }> = [];

  for (const style of root.querySelectorAll("style")) {
    const text = style.textContent;
    mergeMap(cssVars, extractCssCustomProperties(text));
    for (const family of extractFontFamilies(text)) fontFamilies.add(family);
  }

  const links = root.querySelectorAll('link[rel="stylesheet"]');
  for (let idx = 0; idx < links.length; idx += 1) {
    const href = links[idx].getAttribute("href");
    if (!href) continue;
    try {
      const cssUrl = new URL(href, url);
      if (cssUrl.origin !== url.origin) continue;
      const cssResponse = await fetch(cssUrl);
      if (!cssResponse.ok) continue;
      const cssText = await cssResponse.text();
      const fileName = `linked-${idx + 1}.css`;
      const absolute = path.join(uploadsDir, fileName);
      await writeFile(absolute, cssText, "utf8");
      mergeMap(cssVars, extractCssCustomProperties(cssText));
      for (const family of extractFontFamilies(cssText)) fontFamilies.add(family);
    } catch {
      notes.push(`Skipped linked stylesheet: ${href}`);
    }
  }

  const logoCandidate = root
    .querySelectorAll("img")
    .find((img) => /logo|brand/i.test(img.getAttribute("src") ?? ""));
  if (logoCandidate) {
    const src = logoCandidate.getAttribute("src");
    if (src) {
      try {
        const logoUrl = new URL(src, url);
        const logoResponse = await fetch(logoUrl);
        if (logoResponse.ok) {
          const ext = path.extname(logoUrl.pathname) || ".png";
          const fileName = `website-logo${ext}`;
          const absolutePath = path.join(websiteDir, fileName);
          await writeFile(absolutePath, Buffer.from(await logoResponse.arrayBuffer()));
          logoFiles.push({ absolutePath, fileName });
        }
      } catch {
        notes.push(`Skipped logo candidate: ${src}`);
      }
    }
  }

  return {
    brandName: preferredName?.trim() || deriveBrandNameFromHtml(url, html),
    cssVars,
    fontFamilies: [...fontFamilies],
    notes,
    logoFiles,
    uiKitFiles: [{ absolutePath: path.join(websiteDir, "index.html"), fileName: "index.html" }],
    rawFiles: ["uploads/source-url.txt", "uploads/source.html", "uploads/extraction-report.json"],
    homepageHtml: html,
  };
}

async function analyzeLocalTree(
  rootDir: string,
  fallbackBrandName: string,
): Promise<SourceAnalysis> {
  const allFiles = await listFilesRecursive(rootDir);
  const cssVars = new Map<string, string>();
  const fontFamilies = new Set<string>();
  const logoFiles: Array<{ absolutePath: string; fileName: string }> = [];
  const uiKitFiles: Array<{ absolutePath: string; fileName: string }> = [];
  const notes: string[] = [];

  for (const absolutePath of allFiles) {
    const base = path.basename(absolutePath);
    const ext = path.extname(base).toLowerCase();
    if (LOGO_EXTENSIONS.has(ext) && /logo|brand/i.test(base)) {
      logoFiles.push({ absolutePath, fileName: base });
    }
    if (UI_KIT_EXTENSIONS.has(ext) && uiKitFiles.length < 8) {
      uiKitFiles.push({ absolutePath, fileName: base });
    }
    if (!TEXT_FILE_EXTENSIONS.has(ext)) continue;
    try {
      const content = await readFile(absolutePath, "utf8");
      mergeMap(cssVars, extractCssCustomProperties(content));
      for (const family of extractFontFamilies(content)) fontFamilies.add(family);
    } catch {
      notes.push(`Skipped unreadable text file: ${absolutePath}`);
    }
  }

  return {
    brandName: fallbackBrandName,
    cssVars,
    fontFamilies: [...fontFamilies],
    notes,
    logoFiles: logoFiles.slice(0, 8),
    uiKitFiles,
    rawFiles: ["uploads/source-url.txt", "uploads/extraction-report.json"],
    homepageHtml: null,
  };
}

async function writeCanonicalDesignSystem(input: {
  systemDir: string;
  systemId: string;
  brandName: string;
  sourceType: SupportedExtractionSource;
  sourceUrl: string;
  analysis: SourceAnalysis;
}): Promise<string[]> {
  const generated = new Set<string>();
  const fontsDir = path.join(input.systemDir, "fonts");
  const logosDir = path.join(input.systemDir, "assets", "logos");
  const previewDir = path.join(input.systemDir, "preview");
  const uiKitDir = path.join(input.systemDir, "ui_kits", "website");
  const uploadsDir = path.join(input.systemDir, "uploads");
  await Promise.all([
    mkdir(fontsDir, { recursive: true }),
    mkdir(logosDir, { recursive: true }),
    mkdir(previewDir, { recursive: true }),
    mkdir(uiKitDir, { recursive: true }),
    mkdir(uploadsDir, { recursive: true }),
  ]);

  await writeText(
    path.join(input.systemDir, "README.md"),
    buildReadme(input.brandName, input.sourceType, input.sourceUrl, input.analysis),
    generated,
    input.systemDir,
  );
  await writeText(
    path.join(input.systemDir, "SKILL.md"),
    buildSkill(input.brandName),
    generated,
    input.systemDir,
  );
  await writeText(
    path.join(input.systemDir, "colors_and_type.css"),
    buildTokensCss(input.brandName, input.analysis),
    generated,
    input.systemDir,
  );
  await writeText(
    path.join(fontsDir, "fonts.css"),
    buildFontsCss(input.analysis.fontFamilies),
    generated,
    input.systemDir,
  );
  await writeText(
    path.join(uiKitDir, "README.md"),
    buildUiKitReadme(input.brandName, input.sourceType, input.sourceUrl),
    generated,
    input.systemDir,
  );
  await writeText(
    path.join(uploadsDir, "source-url.txt"),
    `${input.sourceUrl}\n`,
    generated,
    input.systemDir,
  );
  await writeText(
    path.join(uploadsDir, "extraction-report.json"),
    JSON.stringify(
      {
        system_id: input.systemId,
        brand_name: input.brandName,
        source_type: input.sourceType,
        source_url: input.sourceUrl,
        detected_css_vars: [...input.analysis.cssVars.entries()],
        detected_font_families: input.analysis.fontFamilies,
        notes: input.analysis.notes,
      },
      null,
      2,
    ),
    generated,
    input.systemDir,
  );

  if (input.analysis.homepageHtml) {
    await writeText(
      path.join(uploadsDir, "source.html"),
      input.analysis.homepageHtml,
      generated,
      input.systemDir,
    );
  }

  for (const fileId of PREVIEW_FILE_IDS) {
    await writeText(
      path.join(previewDir, `${fileId}.html`),
      buildPreviewHtml(fileId, input.brandName, input.analysis),
      generated,
      input.systemDir,
    );
  }

  if (input.analysis.uiKitFiles.length === 0) {
    await writeText(
      path.join(uiKitDir, "index.html"),
      buildUiKitPlaceholderHtml(input.brandName),
      generated,
      input.systemDir,
    );
  } else {
    for (const file of input.analysis.uiKitFiles.slice(0, 8)) {
      const dest = path.join(uiKitDir, safeFileName(file.fileName));
      await copyFile(file.absolutePath, dest);
      generated.add(toSystemRelPath(input.systemDir, dest));
    }
  }

  for (const logo of input.analysis.logoFiles.slice(0, 8)) {
    const dest = path.join(logosDir, safeFileName(logo.fileName));
    await copyFile(logo.absolutePath, dest);
    generated.add(toSystemRelPath(input.systemDir, dest));
  }

  return [...generated].sort();
}

function buildReadme(
  brandName: string,
  sourceType: SupportedExtractionSource,
  sourceUrl: string,
  analysis: SourceAnalysis,
): string {
  const caveats = [
    analysis.cssVars.size === 0
      ? "- No native CSS custom properties were detected. Canonical token defaults were synthesized."
      : "- Canonical token names were synthesized from detected source variables and safe defaults.",
    analysis.logoFiles.length === 0
      ? "- No explicit logo asset was found during ingestion."
      : `- ${analysis.logoFiles.length} logo-like asset(s) were copied into assets/logos.`,
    analysis.fontFamilies.length === 0
      ? "- No source font-family declarations were detected; fallback stacks were used."
      : `- Font family candidates detected: ${analysis.fontFamilies.join(", ")}.`,
    ...analysis.notes.map((note) => `- ${note}`),
  ];

  return `# ${brandName} Design System

## Index
| File | Contents |
|---|---|
| README.md | Brand narrative, rules, caveats |
| SKILL.md | Claude Code compatible brand skill |
| colors_and_type.css | Canonical token file |
| fonts/fonts.css | Font-face and fallback declarations |
| assets/logos/ | Copied logo candidates |
| preview/ | 16 preview cards |
| ui_kits/website/ | Captured or synthesized UI kit files |
| uploads/ | Extraction source records and manifest |

## Brand snapshot
This draft design system was scaffolded from a ${sourceType} source at ${sourceUrl}.
The goal is to normalize raw styles, assets, and component clues into the BurnGuard
canonical format so the system can be reviewed, edited, and later published.

## CONTENT FUNDAMENTALS
- Voice: clear, institutional, confident
- Tone: concise, directive, low-hype
- Casing: title case for headlines, sentence case for body
- Numerals: prefer tabular, data-friendly formatting
- Emoji: avoid by default
- Vibe: premium, trustworthy, structured
- Examples: short headers, restrained claims, evidence-backed labels

## VISUAL FOUNDATIONS
- Colors: use the canonical tokens in colors_and_type.css first
- Type: prefer the detected brand families when available, otherwise use the fallbacks in fonts/fonts.css
- Spacing: 4px grid via --sp-1 through --sp-20
- Backgrounds: flat surfaces with restrained contrast shifts
- Animation: subtle, short, useful only
- Hover: emphasize with contrast and border, not novelty
- Press: compress slightly and darken accent colors
- Borders: clean separators, low visual noise
- Shadows: shallow elevation only
- Layout: modular, grid-first, presentation friendly
- Transparency: minimal and purposeful
- Imagery: editorial, sparse, brand-safe
- Cards: clean surfaces with clear grouping

## ICONOGRAPHY
- Logo lockups live in assets/logos when extraction found them
- UI icons should stay geometric and quiet
- Avoid decorative icon overload or novelty illustration styles

## Caveats & substitutions
${caveats.join("\n")}
`;
}

function buildSkill(brandName: string): string {
  const skillName = `${slugify(brandName)}-design`;
  return `---
name: ${skillName}
description: Use this skill to generate ${brandName}-aligned interfaces and artifacts.
user-invocable: true
---

Read README.md first, then apply the visual and content rules from this design system.

## Quick reference
- Tokens: colors_and_type.css
- Fonts: fonts/fonts.css
- Logos: assets/logos/
- Preview cards: preview/
- UI kit: ui_kits/website/
- Voice: concise, premium, low-hype
- Visual rules: structured layouts, restrained accents, token-first styling
`;
}

function buildFontsCss(fontFamilies: string[]): string {
  const preferredSans = cssString(fontFamilies[0] ?? "Inter");
  const preferredDisplay = cssString(fontFamilies[1] ?? fontFamilies[0] ?? "Inter");
  return `:root {
  --font-sans-fallback: ${preferredSans}, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-display-fallback: ${preferredDisplay}, ${preferredSans}, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-serif-fallback: "Iowan Old Style", "Times New Roman", serif;
  --font-mono-fallback: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}
`;
}

function buildTokensCss(brandName: string, analysis: SourceAnalysis): string {
  const primary = firstValue(
    analysis.cssVars,
    ["primary-blue", "brand-primary", "color-primary", "primary", "accent"],
    "#0057B8",
  );
  const action = firstValue(
    analysis.cssVars,
    ["action-blue", "interactive", "link", "brand-action"],
    primary,
  );
  const sans = cssString(analysis.fontFamilies[0] ?? "Inter");
  const display = cssString(analysis.fontFamilies[1] ?? analysis.fontFamilies[0] ?? "Inter");
  const sourceAliases =
    analysis.cssVars.size === 0
      ? ""
      : `\n  /* Source-derived aliases */\n${[...analysis.cssVars.entries()]
          .slice(0, 48)
          .map(([key, value]) => `  --src-${key}: ${value};`)
          .join("\n")}`;

  return `/* ${brandName} canonical token file */
:root {
  /* Neutrals */
  --gray-10: #0f172a;
  --gray-20: #1f2937;
  --gray-30: #374151;
  --gray-40: #4b5563;
  --gray-50: #6b7280;
  --gray-60: #9ca3af;
  --gray-70: #cbd5e1;
  --gray-80: #e2e8f0;
  --gray-90: #f1f5f9;
  --gray-100: #f8fafc;

  /* Brand */
  --primary-blue: ${primary};
  --action-blue: ${action};

  /* Accent ramps */
  --red-60: #dc2626;
  --orange-50: #ea580c;
  --yellow-30: #facc15;
  --green-60: #16a34a;
  --teal-50: #0f766e;
  --aqua-60: #0891b2;
  --blue-40: #60a5fa;
  --blue-60: #2563eb;
  --blue-80: #1d4ed8;
  --ultramarine-60: #4338ca;
  --purple-60: #7c3aed;
  --pink-60: #db2777;

  /* Semantic */
  --success: #15803d;
  --warning-yellow: #eab308;
  --warning-orange: #f97316;
  --error: #dc2626;
  --info: ${action};

  /* Surface & text */
  --bg: #ffffff;
  --bg-subtle: #f8fafc;
  --bg-muted: #eef2f7;
  --surface: #ffffff;
  --surface-inverse: #0f172a;
  --fg-1: #0f172a;
  --fg-2: #334155;
  --fg-3: #64748b;
  --fg-4: #94a3b8;
  --fg-on-dark: #f8fafc;
  --fg-on-brand: #ffffff;
  --border: #dbe4ee;
  --border-strong: #94a3b8;
  --focus-ring: ${action};

  /* Charts */
  --chart-1: #1d4ed8;
  --chart-2: #0891b2;
  --chart-3: #0f766e;
  --chart-4: #16a34a;
  --chart-5: #ca8a04;
  --chart-6: #ea580c;
  --chart-7: #dc2626;
  --chart-8: #c026d3;
  --chart-9: #7c3aed;
  --chart-10: #4338ca;

  /* Type families */
  --font-display: ${display}, var(--font-display-fallback);
  --font-serif: "Iowan Old Style", "Times New Roman", serif;
  --font-sans: ${sans}, var(--font-sans-fallback);
  --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;

  /* Type scale */
  --fs-12: 12px;
  --fs-14: 14px;
  --fs-16: 16px;
  --fs-18: 18px;
  --fs-20: 20px;
  --fs-24: 24px;
  --fs-32: 32px;
  --fs-40: 40px;
  --fs-48: 48px;
  --fs-64: 64px;
  --fs-80: 80px;

  /* Weight / leading / tracking */
  --fw-light: 300;
  --fw-regular: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;
  --fw-black: 800;
  --lh-tight: 1.05;
  --lh-snug: 1.2;
  --lh-base: 1.5;
  --lh-relaxed: 1.7;
  --ls-tight: -0.03em;
  --ls-base: 0;
  --ls-wide: 0.04em;
  --ls-eyebrow: 0.12em;

  /* Spacing */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;
  --sp-8: 32px;
  --sp-10: 40px;
  --sp-12: 48px;
  --sp-16: 64px;
  --sp-20: 80px;

  /* Radii */
  --r-0: 0;
  --r-2: 2px;
  --r-4: 4px;
  --r-8: 8px;
  --r-pill: 999px;

  /* Elevation */
  --shadow-1: 0 1px 2px rgba(15, 23, 42, 0.06);
  --shadow-2: 0 6px 16px rgba(15, 23, 42, 0.08);
  --shadow-3: 0 12px 28px rgba(15, 23, 42, 0.12);
  --shadow-4: 0 20px 40px rgba(15, 23, 42, 0.16);

  /* Motion */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-emphasis: cubic-bezier(0.2, 0.9, 0.2, 1);
  --dur-fast: 120ms;
  --dur-base: 200ms;
  --dur-slow: 320ms;${sourceAliases}
}
`;
}

function buildUiKitReadme(
  brandName: string,
  sourceType: SupportedExtractionSource,
  sourceUrl: string,
): string {
  return `# ${brandName} UI Kit

This folder contains copied or synthesized UI implementation files captured from the ${sourceType} source:

- Source: ${sourceUrl}
- Goal: preserve a few representative building blocks alongside the canonical token file
- Status: draft scaffold, review before publishing
`;
}

function buildUiKitPlaceholderHtml(brandName: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(brandName)} UI Kit</title>
  <style>
    body { font-family: Inter, sans-serif; margin: 0; padding: 40px; background: #f8fafc; color: #0f172a; }
    .card { max-width: 960px; margin: 0 auto; background: white; border: 1px solid #dbe4ee; border-radius: 16px; padding: 32px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(brandName)} UI Kit</h1>
    <p>No source component files were copied automatically. This placeholder marks the UI kit slot in the canonical design-system structure.</p>
  </div>
</body>
</html>`;
}

function buildPreviewHtml(
  fileId: (typeof PREVIEW_FILE_IDS)[number],
  brandName: string,
  analysis: SourceAnalysis,
): string {
  const body = previewBody(fileId, analysis);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(brandName)} ${escapeHtml(fileId)}</title>
  <style>
    :root {
      --bg: #ffffff;
      --fg: #0f172a;
      --muted: #64748b;
      --border: #dbe4ee;
      --accent: ${firstValue(analysis.cssVars, ["primary-blue", "brand-primary", "color-primary"], "#0057B8")};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--fg);
      padding: 14px;
    }
    .frame {
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      min-height: 220px;
      background: linear-gradient(180deg, #fff, #f8fafc);
    }
    .bar {
      height: 10px;
      background: linear-gradient(90deg, var(--accent), #0ea5e9);
    }
    .content { padding: 14px; }
    .eyebrow {
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .title {
      font-size: 18px;
      font-weight: 600;
      line-height: 1.2;
      margin-bottom: 8px;
    }
    .muted { color: var(--muted); font-size: 12px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .chip { border: 1px solid var(--border); border-radius: 999px; padding: 4px 8px; font-size: 11px; }
    .stack { display: grid; gap: 10px; }
    .swatch { height: 28px; border-radius: 8px; border: 1px solid rgba(15,23,42,0.06); }
    .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid transparent; font-size: 12px; font-weight: 600; }
    .btn-primary { background: var(--accent); color: white; }
    .btn-secondary { background: white; color: var(--fg); border-color: var(--border); }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .field { border: 1px solid var(--border); border-radius: 8px; padding: 8px; font-size: 12px; background: white; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    td, th { border-top: 1px solid var(--border); padding: 6px 4px; text-align: left; }
  </style>
</head>
<body>
  <div class="frame">
    <div class="bar"></div>
    <div class="content">
      ${body}
    </div>
  </div>
</body>
</html>`;
}

function previewBody(
  fileId: (typeof PREVIEW_FILE_IDS)[number],
  analysis: SourceAnalysis,
): string {
  const firstFont = escapeHtml(analysis.fontFamilies[0] ?? "Inter");
  switch (fileId) {
    case "brand-logos":
      return `<div class="eyebrow">Brand</div><div class="title">Logo inventory</div><div class="muted">${analysis.logoFiles.length} asset(s) copied into assets/logos.</div><div class="chips">${(analysis.logoFiles.length ? analysis.logoFiles : [{ fileName: "No logos detected", absolutePath: "" }]).slice(0, 6).map((logo) => `<div class="chip">${escapeHtml(logo.fileName)}</div>`).join("")}</div>`;
    case "brand-icons":
      return `<div class="eyebrow">Brand</div><div class="title">Icon direction</div><div class="muted">Quiet, geometric, interface-safe iconography.</div><div class="chips"><div class="chip">1.5px stroke</div><div class="chip">Low ornament</div><div class="chip">Grid aligned</div></div>`;
    case "colors-brand":
      return `<div class="eyebrow">Color</div><div class="title">Brand colors</div><div class="stack"><div class="swatch" style="background:#0057B8"></div><div class="swatch" style="background:#2563eb"></div><div class="swatch" style="background:#0ea5e9"></div></div>`;
    case "colors-neutrals":
      return `<div class="eyebrow">Color</div><div class="title">Neutral scale</div><div class="stack"><div class="swatch" style="background:#0f172a"></div><div class="swatch" style="background:#64748b"></div><div class="swatch" style="background:#f8fafc"></div></div>`;
    case "colors-ramps":
      return `<div class="eyebrow">Color</div><div class="title">Accent ramps</div><div class="grid"><div class="swatch" style="background:#dc2626"></div><div class="swatch" style="background:#ea580c"></div><div class="swatch" style="background:#16a34a"></div><div class="swatch" style="background:#7c3aed"></div></div>`;
    case "colors-semantic":
      return `<div class="eyebrow">Color</div><div class="title">Semantic roles</div><div class="chips"><div class="chip">Success</div><div class="chip">Warning</div><div class="chip">Error</div><div class="chip">Info</div></div>`;
    case "colors-charts":
      return `<div class="eyebrow">Color</div><div class="title">Chart palette</div><div class="grid"><div class="swatch" style="background:#1d4ed8"></div><div class="swatch" style="background:#0891b2"></div><div class="swatch" style="background:#16a34a"></div><div class="swatch" style="background:#ea580c"></div></div>`;
    case "type-display":
      return `<div class="eyebrow">Typography</div><div class="title" style="font-size:26px">Display sample</div><div class="muted">Primary display family candidate: ${firstFont}</div>`;
    case "type-headings":
      return `<div class="eyebrow">Typography</div><div class="title">Heading hierarchy</div><div class="stack"><div style="font-size:20px;font-weight:700">H1 Heading</div><div style="font-size:16px;font-weight:600">H2 Heading</div><div class="muted">Structured, low-hype hierarchy.</div></div>`;
    case "type-body":
      return `<div class="eyebrow">Typography</div><div class="title">Body copy</div><div class="muted">Design systems work best when everyday copy feels calm, measured, and readable across app, deck, and handoff contexts.</div>`;
    case "spacing":
      return `<div class="eyebrow">Foundations</div><div class="title">Spacing scale</div><div class="chips"><div class="chip">4</div><div class="chip">8</div><div class="chip">12</div><div class="chip">16</div><div class="chip">24</div><div class="chip">32</div></div>`;
    case "radii-shadows":
      return `<div class="eyebrow">Foundations</div><div class="title">Radii & shadows</div><div class="grid"><div class="field" style="border-radius:4px;box-shadow:0 1px 2px rgba(15,23,42,0.08)">Small radius</div><div class="field" style="border-radius:12px;box-shadow:0 12px 24px rgba(15,23,42,0.12)">Large radius</div></div>`;
    case "components-buttons":
      return `<div class="eyebrow">Components</div><div class="title">Buttons</div><div class="chips"><button class="btn btn-primary">Primary</button><button class="btn btn-secondary">Secondary</button></div>`;
    case "components-cards":
      return `<div class="eyebrow">Components</div><div class="title">Cards</div><div class="stack"><div class="field"><strong>Insight card</strong><div class="muted">Key metric with concise explanation.</div></div><div class="field"><strong>Editorial card</strong><div class="muted">Quiet frame, clear grouping.</div></div></div>`;
    case "components-forms":
      return `<div class="eyebrow">Components</div><div class="title">Forms</div><div class="stack"><div class="field">Label<br>Input field</div><div class="field">Select field</div></div>`;
    case "components-badges-table":
      return `<div class="eyebrow">Components</div><div class="title">Badges & table</div><div class="chips"><div class="chip">Published</div><div class="chip">Draft</div></div><table><thead><tr><th>Item</th><th>Status</th></tr></thead><tbody><tr><td>Token sync</td><td>Ready</td></tr><tr><td>Preview cards</td><td>Draft</td></tr></tbody></table>`;
  }
}

async function listFilesRecursive(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        await walk(absolute);
      } else if (entry.isFile()) {
        out.push(absolute);
      }
    }
  }
  await walk(rootDir);
  return out;
}

async function allocateSystemId(baseSlug: string): Promise<string> {
  const safeBase = slugify(baseSlug || "design-system");
  let candidate = safeBase;
  let n = 2;
  while (await getDesignSystemDetail(candidate)) {
    candidate = `${safeBase}-${n}`;
    n += 1;
    if (n > 9999) {
      throw new DesignSystemExtractError(
        "system_id_conflict",
        `Could not allocate a unique design system id for ${safeBase}`,
      );
    }
  }
  return candidate;
}

async function writeText(
  absolutePath: string,
  content: string,
  generated: Set<string>,
  rootDir: string,
) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
  generated.add(toSystemRelPath(rootDir, absolutePath));
}

function toSystemRelPath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).replaceAll("\\", "/");
}

function mergeMap(target: Map<string, string>, next: Map<string, string>) {
  for (const [key, value] of next) {
    if (!target.has(key)) target.set(key, value);
  }
}

function firstValue(
  vars: Map<string, string>,
  candidates: string[],
  fallback: string,
): string {
  for (const key of candidates) {
    const value = vars.get(key);
    if (value) return value;
  }
  return fallback;
}

function deriveBrandNameFromGitUrl(sourceUrl: string): string {
  const trimmed = sourceUrl.replace(/\.git(?:[#?].*)?$/i, "");
  const tail = trimmed.split(/[/:]/).filter(Boolean).pop() ?? "Design System";
  return humanizeSlug(tail);
}

function deriveBrandNameFromHtml(url: URL, html: string): string {
  const root = parse(html);
  const title = root.querySelector("title")?.text.trim();
  if (title) return normalizeBrandName(title.split(/[|\-–—]/)[0] ?? title);
  return normalizeBrandName(url.hostname.replace(/^www\./, "").split(".")[0] ?? "Website");
}

function normalizeBrandName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .trim();
}

function humanizeSlug(value: string): string {
  return normalizeBrandName(
    value
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase()),
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "design-system";
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

function cssString(value: string): string {
  return value.includes(" ") ? `"${value}"` : value;
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function resolveDesignSystemFile(
  systemId: string,
  relPath: string,
): Promise<string | null> {
  const detail = await getDesignSystemDetail(systemId);
  if (!detail) return null;
  const normalized = relPath.replaceAll("\\", "/");
  if (
    !normalized ||
    normalized.includes("..") ||
    normalized.startsWith("/") ||
    path.isAbsolute(normalized)
  ) {
    return null;
  }
  const absolute = path.join(detail.dir_path, normalized);
  const info = await stat(absolute).catch(() => null);
  if (!info?.isFile()) return null;
  return absolute;
}

export function contentTypeForDesignSystemFile(relPath: string): string {
  const ext = path.extname(relPath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".woff2":
      return "font/woff2";
    case ".ttf":
      return "font/ttf";
    case ".otf":
      return "font/otf";
    case ".js":
    case ".jsx":
    case ".ts":
    case ".tsx":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
