import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "node-html-parser";
import {
  APP_VERSION,
  type CreateDesignSystemExtractionRequest,
  type CreateDesignSystemExtractionResponse,
  type CreateDesignSystemUploadRequest,
  type DesignSystemDetail,
  type DesignSystemSourceType,
} from "@bg/shared";
import { createDesignSystemRecord, getDesignSystemDetail } from "../db/seed";
import { systemsDir } from "../lib/paths";
import { detectComponentSamples } from "./upload-component-detect";
import { UPLOAD_EXTRACTOR_PY } from "./upload-extractor-py";

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
const MAX_LINKED_PAGES = 4;
const MAX_HTML_BYTES = 900_000;
const MAX_CSS_BYTES = 700_000;
const MAX_LOGO_BYTES = 2_500_000;
const MAX_TOTAL_DOWNLOAD_BYTES = 8_000_000;
const MAX_FETCH_REDIRECTS = 5;
const MAX_UPLOAD_BYTES = 48_000_000;
const MAX_FONT_UPLOAD_BYTES = 16_000_000;
const MAX_UPLOAD_UI_KIT_PAGES = 8;
const BLOCKED_IMPORT_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata",
  "metadata.google.internal",
  "169.254.169.254",
]);

const SUPPORTED_UPLOAD_EXTENSIONS = new Map([
  [".pdf", "pdf"],
  [".pptx", "pptx"],
] as const);
const SUPPORTED_FONT_EXTENSIONS = new Set([".woff2", ".woff", ".ttf", ".otf"]);

type SupportedExtractionSource = Extract<
  DesignSystemSourceType,
  "github" | "website" | "upload"
>;
type SupportedUploadKind = "pdf" | "pptx";

interface SourceArtifact {
  absolutePath: string;
  relPath: string;
}

interface SourceAnalysis {
  brandName: string;
  cssVars: Map<string, string>;
  fontFamilies: string[];
  colors: string[];
  fontSizes: string[];
  fontWeights: string[];
  spacingValues: string[];
  radii: string[];
  shadows: string[];
  notes: string[];
  logoFiles: Array<{ absolutePath: string; fileName: string }>;
  uiKitFiles: Array<{ absolutePath: string; fileName: string }>;
  rawFiles: string[];
  homepageHtml: string | null;
  fetchedPageCount: number;
  componentSamples: {
    buttons: string[];
    cards: string[];
    forms: string[];
    tables: string[];
    badges: string[];
    headings: string[];
    body: string[];
  };
  artifactCopies: SourceArtifact[];
}

export interface UploadManifestPage {
  index: number;
  title: string;
  summary: string;
  text_excerpt: string;
}

export interface UploadManifest {
  kind: SupportedUploadKind;
  brand_name?: string;
  page_count: number;
  fonts: string[];
  colors: string[];
  font_sizes: string[];
  font_weights: string[];
  spacing_values: string[];
  radii: string[];
  shadows: string[];
  notes: string[];
  /**
   * Slice 4 (P4.2 follow-up): Python emits raw text lines now instead
   * of pre-classified component buckets. `detectComponentSamples` on
   * the TS side does the locale-aware classification.
   */
  headings: string[];
  bodies: string[];
  misc_lines: string[];
  pages: UploadManifestPage[];
}

export class DesignSystemExtractError extends Error {
  constructor(
    readonly code:
      | "invalid_source_url"
      | "invalid_upload"
      | "unsupported_source_type"
      | "git_clone_failed"
      | "upload_extract_failed"
      | "website_fetch_failed"
      | "system_id_conflict",
    message: string,
  ) {
    super(message);
    this.name = "DesignSystemExtractError";
  }
}

export class DesignSystemAssetEditError extends Error {
  constructor(
    readonly code:
      | "design_system_not_found"
      | "tokens_file_missing"
      | "invalid_color_token"
      | "invalid_color_value"
      | "invalid_font_upload",
    message: string,
  ) {
    super(message);
    this.name = "DesignSystemAssetEditError";
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

export async function extractDesignSystemFromUpload(input: {
  file: File;
  body?: CreateDesignSystemUploadRequest;
}): Promise<CreateDesignSystemExtractionResponse> {
  const uploadName = input.file.name?.trim();
  if (!uploadName) {
    throw new DesignSystemExtractError(
      "invalid_upload",
      "Uploaded file must have a filename",
    );
  }
  if (input.file.size <= 0) {
    throw new DesignSystemExtractError(
      "invalid_upload",
      "Uploaded file is empty",
    );
  }
  if (input.file.size > MAX_UPLOAD_BYTES) {
    throw new DesignSystemExtractError(
      "invalid_upload",
      `Upload exceeds ${MAX_UPLOAD_BYTES} bytes`,
    );
  }

  const uploadKind = inferUploadKind(uploadName, input.file.type);
  if (!uploadKind) {
    throw new DesignSystemExtractError(
      "invalid_upload",
      "Only .pptx and .pdf design system uploads are supported",
    );
  }

  const tmpRoot = await mkdtemp(path.join(tmpdir(), "burnguard-ds-upload-"));
  try {
    const ingestDir = path.join(tmpRoot, "ingest");
    await mkdir(ingestDir, { recursive: true });
    const sourceFileName = safeFileName(uploadName);
    const sourcePath = path.join(ingestDir, sourceFileName);
    await writeFile(sourcePath, Buffer.from(await input.file.arrayBuffer()));

    const analysis = await ingestUploadSource({
      ingestDir,
      sourcePath,
      sourceFileName,
      uploadKind,
      preferredName: input.body?.name,
    });

    const brandName = input.body?.name?.trim() || analysis.brandName;
    const systemId = await allocateSystemId(
      input.body?.system_id ?? slugify(brandName),
    );
    const systemDir = path.join(systemsDir, systemId);
    const sourceUrl = `upload://${sourceFileName}`;

    const generatedFiles = await writeCanonicalDesignSystem({
      systemDir,
      systemId,
      brandName,
      sourceType: "upload",
      sourceUrl,
      analysis,
    });

    const created = await createDesignSystemRecord({
      id: systemId,
      name: brandName,
      description: `Upload extraction scaffold from ${uploadName}`,
      status: "draft",
      sourceType: "upload",
      sourceUri: uploadName,
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
        inferred_source_type: "upload",
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

export async function readDesignSystemTokens(systemId: string) {
  const detail = await getDesignSystemDetail(systemId);
  if (!detail) {
    throw new DesignSystemAssetEditError(
      "design_system_not_found",
      "Design system not found",
    );
  }
  if (!detail.tokens_css_path) {
    return { colors: [], token_file_path: null };
  }

  const css = await readFile(detail.tokens_css_path, "utf8").catch(() => null);
  if (css === null) {
    return { colors: [], token_file_path: detail.tokens_css_path };
  }

  const colors = [...extractCssCustomProperties(css).entries()]
    .filter(([, value]) => isColorTokenValue(value))
    .map(([name, value]) => ({ name, value }));

  return { colors, token_file_path: detail.tokens_css_path };
}

export async function upsertDesignSystemColorToken(
  systemId: string,
  input: { name: string; value: string },
) {
  const detail = await getDesignSystemDetail(systemId);
  if (!detail) {
    throw new DesignSystemAssetEditError(
      "design_system_not_found",
      "Design system not found",
    );
  }
  if (!detail.tokens_css_path) {
    throw new DesignSystemAssetEditError(
      "tokens_file_missing",
      "Design system does not have a colors_and_type.css token file",
    );
  }

  const tokenName = normalizeCssTokenName(input.name);
  if (!tokenName) {
    throw new DesignSystemAssetEditError(
      "invalid_color_token",
      "Color token name must contain letters, numbers, dashes, or underscores",
    );
  }

  const colorValue = input.value.trim();
  if (!isColorTokenValue(colorValue)) {
    throw new DesignSystemAssetEditError(
      "invalid_color_value",
      "Color value must be a safe CSS color value",
    );
  }

  const existingCss = await readFile(detail.tokens_css_path, "utf8").catch(
    () => "",
  );
  const nextCss = upsertCssCustomProperty(existingCss, tokenName, colorValue);
  await writeFile(detail.tokens_css_path, nextCss, "utf8");
  return await readDesignSystemTokens(systemId);
}

export async function uploadDesignSystemFont(input: {
  systemId: string;
  file: File;
  family?: string;
  role?: "display" | "sans" | "serif" | "mono" | null;
}) {
  const detail = await getDesignSystemDetail(input.systemId);
  if (!detail) {
    throw new DesignSystemAssetEditError(
      "design_system_not_found",
      "Design system not found",
    );
  }

  const originalName = input.file.name?.trim();
  if (!originalName) {
    throw new DesignSystemAssetEditError(
      "invalid_font_upload",
      "Uploaded font must have a filename",
    );
  }
  const ext = path.extname(originalName).toLowerCase();
  if (!SUPPORTED_FONT_EXTENSIONS.has(ext)) {
    throw new DesignSystemAssetEditError(
      "invalid_font_upload",
      "Only .woff2, .woff, .ttf, and .otf font files are supported",
    );
  }
  if (input.file.size <= 0 || input.file.size > MAX_FONT_UPLOAD_BYTES) {
    throw new DesignSystemAssetEditError(
      "invalid_font_upload",
      `Font upload must be between 1 byte and ${MAX_FONT_UPLOAD_BYTES} bytes`,
    );
  }

  const fontsDir = path.join(detail.dir_path, "fonts");
  await mkdir(fontsDir, { recursive: true });
  const fileName = safeFileName(originalName);
  const fontPath = path.join(fontsDir, fileName);
  const family = normalizeFontFamily(input.family) || humanizeSlug(path.basename(fileName, ext));
  const role = input.role ?? null;

  await writeFile(fontPath, Buffer.from(await input.file.arrayBuffer()));
  await appendFontFaceRule(path.join(fontsDir, "fonts.css"), family, fileName);

  if (role && detail.tokens_css_path) {
    const existingCss = await readFile(detail.tokens_css_path, "utf8").catch(
      () => "",
    );
    const fallback =
      role === "display"
        ? "var(--font-display-fallback)"
        : role === "sans"
          ? "var(--font-sans-fallback)"
          : role === "serif"
            ? "var(--font-serif-fallback)"
            : "var(--font-mono-fallback)";
    const nextCss = upsertCssCustomProperty(
      existingCss,
      `font-${role}`,
      `${cssString(family)}, ${fallback}`,
    );
    await writeFile(detail.tokens_css_path, nextCss, "utf8");
  }

  return {
    file_name: fileName,
    family,
    role,
    rel_path: `fonts/${fileName}`,
  };
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

export function inferUploadKind(
  fileName: string,
  contentType?: string | null,
): SupportedUploadKind | null {
  const ext = path.extname(fileName).toLowerCase();
  const fromExtension = SUPPORTED_UPLOAD_EXTENSIONS.get(
    ext as ".pdf" | ".pptx",
  );
  if (fromExtension) return fromExtension;

  const normalized = (contentType ?? "").toLowerCase();
  if (normalized.includes("application/pdf")) return "pdf";
  if (
    normalized.includes(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )
  ) {
    return "pptx";
  }
  return null;
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

export function extractCssStyleSignals(content: string) {
  return {
    colors: extractCssDeclarationValues(
      content,
      /(?:^|[;{\s])(color|background(?:-color)?|border(?:-[a-z-]+)?-color)\s*:\s*([^;}{]+)/gi,
      24,
    ),
    fontSizes: extractCssDeclarationValues(
      content,
      /(?:^|[;{\s])font-size\s*:\s*([^;}{]+)/gi,
      16,
      1,
    ),
    fontWeights: extractCssDeclarationValues(
      content,
      /(?:^|[;{\s])font-weight\s*:\s*([^;}{]+)/gi,
      12,
      1,
    ),
    spacingValues: extractCssDeclarationValues(
      content,
      /(?:^|[;{\s])(?:margin|padding|gap|column-gap|row-gap)\s*:\s*([^;}{]+)/gi,
      24,
      1,
    ),
    radii: extractCssDeclarationValues(
      content,
      /(?:^|[;{\s])border-radius\s*:\s*([^;}{]+)/gi,
      12,
      1,
    ),
    shadows: extractCssDeclarationValues(
      content,
      /(?:^|[;{\s])box-shadow\s*:\s*([^;}{]+)/gi,
      12,
      1,
    ),
  };
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

export function extractHtmlComponentSamples(html: string) {
  const root = parse(html);
  return {
    buttons: collectHtmlTextSamples(root, [
      "button",
      'a[class*="btn"]',
      '[role="button"]',
      'input[type="button"]',
      'input[type="submit"]',
    ]),
    cards: collectHtmlTextSamples(root, [
      'article',
      'section[class*="card"]',
      'div[class*="card"]',
      '[data-card]',
    ]),
    forms: collectHtmlTextSamples(root, [
      "form",
      "label",
      "input",
      "select",
      "textarea",
    ]),
    tables: collectHtmlTextSamples(root, ["table"]),
    badges: collectHtmlTextSamples(root, [
      '[class*="badge"]',
      '[class*="pill"]',
      '[class*="tag"]',
      '[class*="label"]',
    ]),
    headings: collectHtmlTextSamples(root, ["h1", "h2", "h3"]),
    body: collectHtmlTextSamples(root, ["p", "li", "blockquote"]),
  };
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

  let totalDownloadedBytes = 0;
  const noteBytes = (bytes: number) => {
    totalDownloadedBytes += bytes;
    if (totalDownloadedBytes > MAX_TOTAL_DOWNLOAD_BYTES) {
      throw new DesignSystemExtractError(
        "website_fetch_failed",
        `Website import exceeded ${MAX_TOTAL_DOWNLOAD_BYTES} bytes total download budget`,
      );
    }
  };

  const homepage = await fetchWebsiteResource(url, {
    maxBytes: MAX_HTML_BYTES,
    kind: "html",
    noteBytes,
  });
  url = homepage.finalUrl;
  const html = homepage.text;

  const websiteDir = path.join(ingestDir, "website");
  const uploadsDir = path.join(websiteDir, "uploads", "linked-css");
  const pagesDir = path.join(websiteDir, "uploads", "pages");
  await mkdir(uploadsDir, { recursive: true });
  await mkdir(pagesDir, { recursive: true });
  await writeFile(path.join(websiteDir, "index.html"), html, "utf8");

  const cssVars = new Map<string, string>();
  const fontFamilies = new Set<string>();
  const colors = new Set<string>();
  const fontSizes = new Set<string>();
  const fontWeights = new Set<string>();
  const spacingValues = new Set<string>();
  const radii = new Set<string>();
  const shadows = new Set<string>();
  const notes: string[] = ["Homepage HTML fetched from website URL."];
  const logoFiles: Array<{ absolutePath: string; fileName: string }> = [];
  const pageHtmlByUrl = new Map<string, string>([[url.toString(), html]]);
  const pageQueue = await collectCandidateWebsitePages(url, html);

  for (const page of pageQueue) {
    if (pageHtmlByUrl.has(page.toString())) continue;
    try {
      const pageFetch = await fetchWebsiteResource(page, {
        maxBytes: MAX_HTML_BYTES,
        kind: "html",
        noteBytes,
      });
      if (pageHtmlByUrl.has(pageFetch.finalUrl.toString())) continue;
      pageHtmlByUrl.set(pageFetch.finalUrl.toString(), pageFetch.text);
      const fileName = `page-${pageHtmlByUrl.size}.html`;
      await writeFile(path.join(pagesDir, fileName), pageFetch.text, "utf8");
    } catch (error) {
      notes.push(
        `Skipped linked page: ${page.toString()} (${error instanceof Error ? error.message : "fetch failed"})`,
      );
    }
  }

  const componentSamples = {
    buttons: [] as string[],
    cards: [] as string[],
    forms: [] as string[],
    tables: [] as string[],
    badges: [] as string[],
    headings: [] as string[],
    body: [] as string[],
  };
  const seenStylesheets = new Set<string>();
  let stylesheetIndex = 1;

  for (const [pageUrl, pageHtml] of pageHtmlByUrl) {
    const root = parse(pageHtml);
    const sampleSet = extractHtmlComponentSamples(pageHtml);
    mergeStringSamples(componentSamples.buttons, sampleSet.buttons, 6);
    mergeStringSamples(componentSamples.cards, sampleSet.cards, 6);
    mergeStringSamples(componentSamples.forms, sampleSet.forms, 6);
    mergeStringSamples(componentSamples.tables, sampleSet.tables, 6);
    mergeStringSamples(componentSamples.badges, sampleSet.badges, 6);
    mergeStringSamples(componentSamples.headings, sampleSet.headings, 6);
    mergeStringSamples(componentSamples.body, sampleSet.body, 6);

    const inlineCssChunks: string[] = [];
    for (const style of root.querySelectorAll("style")) {
      inlineCssChunks.push(style.textContent);
    }
    for (const node of root.querySelectorAll("[style]")) {
      const value = node.getAttribute("style");
      if (value) inlineCssChunks.push(value.replaceAll("\n", " "));
    }
    if (inlineCssChunks.length > 0) {
      const inlineCss = inlineCssChunks.join("\n");
      mergeMap(cssVars, extractCssCustomProperties(inlineCss));
      mergeSignals(
        { colors, fontSizes, fontWeights, spacingValues, radii, shadows },
        extractCssStyleSignals(inlineCss),
      );
      for (const family of extractFontFamilies(inlineCss)) {
        fontFamilies.add(family);
      }
    }

    const pageBase = new URL(pageUrl);
    const links = root.querySelectorAll('link[rel="stylesheet"]');
    for (let idx = 0; idx < links.length; idx += 1) {
      const href = links[idx].getAttribute("href");
      if (!href) continue;
      try {
        const cssUrl = new URL(href, pageBase);
        if (cssUrl.origin !== url.origin) continue;
        const cssFetch = await fetchWebsiteResource(cssUrl, {
          maxBytes: MAX_CSS_BYTES,
          kind: "css",
          noteBytes,
        });
        if (seenStylesheets.has(cssFetch.finalUrl.toString())) continue;
        seenStylesheets.add(cssFetch.finalUrl.toString());
        const cssText = cssFetch.text;
        const fileName = `linked-${stylesheetIndex}.css`;
        stylesheetIndex += 1;
        const absolute = path.join(uploadsDir, fileName);
        await writeFile(absolute, cssText, "utf8");
        mergeMap(cssVars, extractCssCustomProperties(cssText));
        mergeSignals(
          { colors, fontSizes, fontWeights, spacingValues, radii, shadows },
          extractCssStyleSignals(cssText),
        );
        for (const family of extractFontFamilies(cssText)) {
          fontFamilies.add(family);
        }
      } catch (error) {
        notes.push(
          `Skipped linked stylesheet: ${href} (${error instanceof Error ? error.message : "fetch failed"})`,
        );
      }
    }

    for (const image of root.querySelectorAll("img")) {
      const src = image.getAttribute("src");
      if (!src || !/logo|brand/i.test(src)) continue;
      try {
        const logoUrl = new URL(src, pageBase);
        const dedupedName = safeFileName(
          path.basename(logoUrl.pathname) || "logo.png",
        );
        if (logoFiles.some((logo) => logo.fileName === dedupedName)) continue;
        const logoFetch = await fetchWebsiteResource(logoUrl, {
          maxBytes: MAX_LOGO_BYTES,
          kind: "asset",
          noteBytes,
        });
        const absolutePath = path.join(websiteDir, dedupedName);
        await writeFile(absolutePath, logoFetch.buffer);
        logoFiles.push({ absolutePath, fileName: dedupedName });
      } catch (error) {
        notes.push(
          `Skipped logo candidate: ${src} (${error instanceof Error ? error.message : "fetch failed"})`,
        );
      }
    }
  }

  if (componentSamples.buttons.length > 0) {
    notes.push(
      `Detected component candidates: ${componentSamples.buttons.length} buttons, ${componentSamples.cards.length} cards, ${componentSamples.forms.length} forms.`,
    );
  }
  if (fontSizes.size > 0 || colors.size > 0) {
    notes.push(
      `Style signals extracted from website CSS/HTML: ${colors.size} colors, ${fontSizes.size} font sizes, ${spacingValues.size} spacing values.`,
    );
  }

  return {
    brandName: preferredName?.trim() || deriveBrandNameFromHtml(url, html),
    cssVars,
    fontFamilies: [...fontFamilies],
    colors: [...colors],
    fontSizes: [...fontSizes],
    fontWeights: [...fontWeights],
    spacingValues: [...spacingValues],
    radii: [...radii],
    shadows: [...shadows],
    notes,
    logoFiles: logoFiles.slice(0, 8),
    uiKitFiles: [...pageHtmlByUrl.keys()].map((_pageUrl, index) => ({
      absolutePath:
        index === 0
          ? path.join(websiteDir, "index.html")
          : path.join(pagesDir, `page-${index + 1}.html`),
      fileName: index === 0 ? "index.html" : `page-${index + 1}.html`,
    })),
    rawFiles: [
      "uploads/source-url.txt",
      "uploads/source.html",
      "uploads/extraction-report.json",
      "uploads/pages/",
      "uploads/linked-css/",
    ],
    homepageHtml: html,
    fetchedPageCount: pageHtmlByUrl.size,
    componentSamples,
    artifactCopies: [],
  };
}

async function ingestUploadSource(input: {
  ingestDir: string;
  sourcePath: string;
  sourceFileName: string;
  uploadKind: SupportedUploadKind;
  preferredName?: string;
}): Promise<SourceAnalysis> {
  const manifestPath = path.join(input.ingestDir, "upload-manifest.json");
  await runPythonUploadExtractor({
    sourcePath: input.sourcePath,
    manifestPath,
  });

  const manifest = await readUploadManifest(manifestPath);
  if (manifest.kind !== input.uploadKind) {
    throw new DesignSystemExtractError(
      "upload_extract_failed",
      `Upload parser returned ${manifest.kind} for a ${input.uploadKind} file`,
    );
  }

  const uiKitDir = path.join(input.ingestDir, "ui-kit");
  const uiKitFiles = await buildUploadUiKitFiles({
    uiKitDir,
    brandName:
      input.preferredName?.trim() ||
      manifest.brand_name?.trim() ||
      humanizeSlug(path.basename(input.sourceFileName, path.extname(input.sourceFileName))),
    pages: manifest.pages,
  });

  const notes = [
    `Token-optimized ${manifest.kind.toUpperCase()} upload summary generated via Python extractor.`,
    `Parsed ${manifest.page_count} page(s)/slide(s) from upload.`,
    ...manifest.notes,
  ];
  if (manifest.page_count > MAX_UPLOAD_UI_KIT_PAGES) {
    notes.push(
      `Only the first ${MAX_UPLOAD_UI_KIT_PAGES} of ${manifest.page_count} pages are kept as preview cards; re-upload a trimmed export if you need more.`,
    );
  }

  return {
    brandName:
      input.preferredName?.trim() ||
      manifest.brand_name?.trim() ||
      humanizeSlug(path.basename(input.sourceFileName, path.extname(input.sourceFileName))),
    cssVars: new Map<string, string>(),
    fontFamilies: normalizeUploadStringList(manifest.fonts, 8),
    colors: normalizeUploadStringList(manifest.colors, 24),
    fontSizes: normalizeUploadStringList(manifest.font_sizes, 16),
    fontWeights: normalizeUploadStringList(manifest.font_weights, 12),
    spacingValues: normalizeUploadStringList(manifest.spacing_values, 24),
    radii: normalizeUploadStringList(manifest.radii, 12),
    shadows: normalizeUploadStringList(manifest.shadows, 12),
    notes,
    logoFiles: [],
    uiKitFiles,
    rawFiles: [
      `uploads/${safeFileName(input.sourceFileName)}`,
      "uploads/upload-manifest.json",
      ...uiKitFiles.map((file) => `ui_kits/website/${safeFileName(file.fileName)}`),
    ],
    homepageHtml: null,
    fetchedPageCount: manifest.page_count,
    componentSamples: detectComponentSamples(
      manifest.headings,
      manifest.bodies,
      manifest.misc_lines,
    ),
    artifactCopies: [
      {
        absolutePath: input.sourcePath,
        relPath: path.join("uploads", safeFileName(input.sourceFileName)),
      },
      {
        absolutePath: manifestPath,
        relPath: path.join("uploads", "upload-manifest.json"),
      },
    ],
  };
}

async function analyzeLocalTree(
  rootDir: string,
  fallbackBrandName: string,
): Promise<SourceAnalysis> {
  const allFiles = await listFilesRecursive(rootDir);
  const cssVars = new Map<string, string>();
  const fontFamilies = new Set<string>();
  const colors = new Set<string>();
  const fontSizes = new Set<string>();
  const fontWeights = new Set<string>();
  const spacingValues = new Set<string>();
  const radii = new Set<string>();
  const shadows = new Set<string>();
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
      mergeSignals(
        { colors, fontSizes, fontWeights, spacingValues, radii, shadows },
        extractCssStyleSignals(content),
      );
      for (const family of extractFontFamilies(content)) fontFamilies.add(family);
    } catch {
      notes.push(`Skipped unreadable text file: ${absolutePath}`);
    }
  }

  return {
    brandName: fallbackBrandName,
    cssVars,
    fontFamilies: [...fontFamilies],
    colors: [...colors],
    fontSizes: [...fontSizes],
    fontWeights: [...fontWeights],
    spacingValues: [...spacingValues],
    radii: [...radii],
    shadows: [...shadows],
    notes,
    logoFiles: logoFiles.slice(0, 8),
    uiKitFiles,
    rawFiles: ["uploads/source-url.txt", "uploads/extraction-report.json"],
    homepageHtml: null,
    fetchedPageCount: 0,
    componentSamples: {
      buttons: [],
      cards: [],
      forms: [],
      tables: [],
      badges: [],
      headings: [],
      body: [],
    },
    artifactCopies: [],
  };
}

export async function runPythonUploadExtractor(input: {
  sourcePath: string;
  manifestPath: string;
}) {
  // Write the embedded Python source to a per-call tmp dir so the
  // script path resolves cleanly in dev AND inside a `bun build
  // --compile` binary (where `resolveRepoRoot()` has no source tree
  // to point at). Self-contained so multiple callers — including the
  // chat-attachment pipeline that runs extractions in parallel — don't
  // race on a shared scratch location.
  const scriptDir = await mkdtemp(path.join(tmpdir(), "burnguard-ds-py-"));
  try {
    const scriptPath = path.join(scriptDir, "extract.py");
    await writeFile(scriptPath, UPLOAD_EXTRACTOR_PY, "utf8");
    const candidates =
      process.platform === "win32"
        ? [
            ["py", "-3"],
            ["python"],
          ]
        : [
            ["python3"],
            ["python"],
          ];

    let lastFailure = "Python executable was not found";
    for (const prefix of candidates) {
      try {
        const proc = Bun.spawn({
          cmd: [
            ...prefix,
            scriptPath,
            "--input",
            input.sourcePath,
            "--output",
            input.manifestPath,
          ],
          stdout: "pipe",
          stderr: "pipe",
        });
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]);
        if (exitCode === 0) {
          return;
        }
        lastFailure = [stderr.trim(), stdout.trim()]
          .filter(Boolean)
          .join("\n")
          .trim() || `Python extractor exited with code ${exitCode}`;
        // The command existed but the extractor failed; don't mask it
        // with later fallbacks.
        break;
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error);
      }
    }

    throw new DesignSystemExtractError("upload_extract_failed", lastFailure);
  } finally {
    await rm(scriptDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function readUploadManifest(manifestPath: string): Promise<UploadManifest> {
  const raw = await readFile(manifestPath, "utf8").catch(() => null);
  if (!raw) {
    throw new DesignSystemExtractError(
      "upload_extract_failed",
      "Python upload extractor did not produce a manifest",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DesignSystemExtractError(
      "upload_extract_failed",
      "Upload manifest was not valid JSON",
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new DesignSystemExtractError(
      "upload_extract_failed",
      "Upload manifest had an invalid shape",
    );
  }

  const manifest = parsed as Partial<UploadManifest>;
  if (
    manifest.kind !== "pdf" &&
    manifest.kind !== "pptx"
  ) {
    throw new DesignSystemExtractError(
      "upload_extract_failed",
      "Upload manifest is missing a supported kind",
    );
  }

  return {
    kind: manifest.kind,
    brand_name:
      typeof manifest.brand_name === "string" ? manifest.brand_name : undefined,
    page_count:
      typeof manifest.page_count === "number" && Number.isFinite(manifest.page_count)
        ? Math.max(0, Math.trunc(manifest.page_count))
        : 0,
    fonts: normalizeUploadStringList(manifest.fonts, 8),
    colors: normalizeUploadStringList(manifest.colors, 24),
    font_sizes: normalizeUploadStringList(manifest.font_sizes, 16),
    font_weights: normalizeUploadStringList(manifest.font_weights, 12),
    spacing_values: normalizeUploadStringList(manifest.spacing_values, 24),
    radii: normalizeUploadStringList(manifest.radii, 12),
    shadows: normalizeUploadStringList(manifest.shadows, 12),
    notes: normalizeUploadStringList(manifest.notes, 16),
    headings: normalizeUploadStringList(manifest.headings, 32),
    bodies: normalizeUploadStringList(manifest.bodies, 32),
    misc_lines: normalizeUploadStringList(manifest.misc_lines, 64),
    pages: normalizeUploadPages(manifest.pages),
  };
}

export function normalizeUploadStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

export function normalizeUploadPages(value: unknown): UploadManifestPage[] {
  if (!Array.isArray(value)) return [];
  const out: UploadManifestPage[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const page = entry as Record<string, unknown>;
    out.push({
      index:
        typeof page.index === "number" && Number.isFinite(page.index)
          ? Math.max(1, Math.trunc(page.index))
          : out.length + 1,
      title: typeof page.title === "string" ? page.title.trim() : "",
      summary: typeof page.summary === "string" ? page.summary.trim() : "",
      text_excerpt:
        typeof page.text_excerpt === "string" ? page.text_excerpt.trim() : "",
    });
    if (out.length >= MAX_UPLOAD_UI_KIT_PAGES) break;
  }
  return out;
}

async function buildUploadUiKitFiles(input: {
  uiKitDir: string;
  brandName: string;
  pages: UploadManifestPage[];
}) {
  await mkdir(input.uiKitDir, { recursive: true });
  const files: Array<{ absolutePath: string; fileName: string }> = [];
  const pages =
    input.pages.length > 0
      ? input.pages.slice(0, MAX_UPLOAD_UI_KIT_PAGES)
      : [
          {
            index: 1,
            title: `${input.brandName} upload`,
            summary: "No structured page previews were recovered from the upload.",
            text_excerpt:
              "The canonical draft was still created, but this upload needs manual review.",
          },
        ];

  for (const page of pages) {
    const fileName = `page-${page.index}.html`;
    const absolutePath = path.join(input.uiKitDir, fileName);
    await writeFile(
      absolutePath,
      buildUploadPageHtml(input.brandName, page),
      "utf8",
    );
    files.push({ absolutePath, fileName });
  }

  return files;
}

function buildUploadPageHtml(brandName: string, page: UploadManifestPage): string {
  const title = escapeHtml(page.title || `Page ${page.index}`);
  const summary = escapeHtml(page.summary || "Token-optimized upload summary");
  const excerpt = escapeHtml(page.text_excerpt || "No compact excerpt was available.");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(brandName)} upload preview</title>
  <style>
    :root {
      --bg: #f6f7fb;
      --card: #ffffff;
      --fg: #111827;
      --muted: #6b7280;
      --border: rgba(17, 24, 39, 0.12);
      --accent: #2563eb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top right, rgba(37,99,235,0.14), transparent 34%),
        var(--bg);
      color: var(--fg);
      padding: 24px;
    }
    .card {
      max-width: 960px;
      margin: 0 auto;
      border: 1px solid var(--border);
      border-radius: 20px;
      background: var(--card);
      padding: 28px;
      box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
    }
    .eyebrow {
      font-size: 11px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent);
      font-weight: 700;
    }
    h1 {
      margin: 10px 0 8px;
      font-size: 32px;
      line-height: 1.1;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.65;
    }
    .excerpt {
      margin-top: 22px;
      white-space: pre-wrap;
      border-top: 1px solid var(--border);
      padding-top: 18px;
      color: var(--fg);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="eyebrow">Upload preview · Page ${page.index}</div>
    <h1>${title}</h1>
    <p>${summary}</p>
    <p class="excerpt">${excerpt}</p>
  </div>
</body>
</html>`;
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
          detected_colors: input.analysis.colors,
          detected_font_sizes: input.analysis.fontSizes,
          detected_spacing_values: input.analysis.spacingValues,
          detected_radii: input.analysis.radii,
          detected_shadows: input.analysis.shadows,
          component_samples: input.analysis.componentSamples,
          fetched_page_count: input.analysis.fetchedPageCount,
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

  for (const artifact of input.analysis.artifactCopies) {
    const normalizedRelPath = artifact.relPath.replaceAll("\\", "/");
    const dest = path.join(input.systemDir, normalizedRelPath);
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(artifact.absolutePath, dest);
    generated.add(toSystemRelPath(input.systemDir, dest));
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
    for (const file of input.analysis.uiKitFiles.slice(0, MAX_UPLOAD_UI_KIT_PAGES)) {
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
    analysis.fetchedPageCount > 1
      ? `- ${analysis.fetchedPageCount} same-origin pages were analyzed for broader component coverage.`
      : "- Only the landing page was analyzed; deeper site coverage may still be needed.",
    analysis.fontFamilies.length === 0
      ? "- No source font-family declarations were detected; fallback stacks were used."
      : `- Font family candidates detected: ${analysis.fontFamilies.join(", ")}.`,
    analysis.componentSamples.buttons.length === 0 &&
    analysis.componentSamples.cards.length === 0
      ? "- No strong component samples were extracted from the website HTML."
      : `- Extracted component samples: ${analysis.componentSamples.buttons.length} buttons, ${analysis.componentSamples.cards.length} cards, ${analysis.componentSamples.forms.length} forms.`,
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
  const extractedColorAliases =
    analysis.colors.length === 0
      ? ""
      : `\n  /* Extracted raw colors from source declarations */\n${analysis.colors
          .slice(0, 16)
          .map((value, index) => `  --src-color-${index + 1}: ${value};`)
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
  --dur-slow: 320ms;${sourceAliases}${extractedColorAliases}
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
  const sampleButton = escapeHtml(analysis.componentSamples.buttons[0] ?? "Primary");
  const sampleCardTitle = escapeHtml(analysis.componentSamples.cards[0] ?? "Insight card");
  const sampleForm = escapeHtml(analysis.componentSamples.forms[0] ?? "Email");
  const sampleBadge = escapeHtml(analysis.componentSamples.badges[0] ?? "Published");
  const sampleTable = escapeHtml(analysis.componentSamples.tables[0] ?? "Row 1");
  const sampleHeading = escapeHtml(analysis.componentSamples.headings[0] ?? "Display sample");
  const sampleBody = escapeHtml(
    analysis.componentSamples.body[0] ??
      "Design systems work best when everyday copy feels calm and readable.",
  );
  const sampleSpacing = analysis.spacingValues.slice(0, 6);
  const sampleColors = analysis.colors.slice(0, 6);
  const sampleFontSizes = analysis.fontSizes.slice(0, 3);
  const sampleFontWeights = analysis.fontWeights.slice(0, 2);
  const sampleRadius = analysis.radii[0] ?? "4px";
  const sampleShadow =
    analysis.shadows[0] ?? "0 1px 2px rgba(15,23,42,0.08)";
  switch (fileId) {
    case "brand-logos":
      return `<div class="eyebrow">Brand</div><div class="title">Logo inventory</div><div class="muted">${analysis.logoFiles.length} asset(s) copied into assets/logos.</div><div class="chips">${(analysis.logoFiles.length ? analysis.logoFiles : [{ fileName: "No logos detected", absolutePath: "" }]).slice(0, 6).map((logo) => `<div class="chip">${escapeHtml(logo.fileName)}</div>`).join("")}</div>`;
    case "brand-icons":
      return `<div class="eyebrow">Brand</div><div class="title">Icon direction</div><div class="muted">Quiet, geometric, interface-safe iconography.</div><div class="chips"><div class="chip">1.5px stroke</div><div class="chip">Low ornament</div><div class="chip">Grid aligned</div></div>`;
    case "colors-brand":
      return `<div class="eyebrow">Color</div><div class="title">Brand colors</div><div class="stack">${(sampleColors.length > 0 ? sampleColors.slice(0, 3) : ["#0057B8", "#2563eb", "#0ea5e9"]).map((value) => `<div class="swatch" style="background:${escapeHtml(value)}"></div>`).join("")}</div><div class="muted">${sampleColors.length > 0 ? "Source-derived swatches" : "Fallback swatches"}</div>`;
    case "colors-neutrals":
      return `<div class="eyebrow">Color</div><div class="title">Neutral scale</div><div class="stack">${(sampleColors.length >= 6 ? sampleColors.slice(3, 6) : ["#0f172a", "#64748b", "#f8fafc"]).map((value) => `<div class="swatch" style="background:${escapeHtml(value)}"></div>`).join("")}</div>`;
    case "colors-ramps":
      return `<div class="eyebrow">Color</div><div class="title">Accent ramps</div><div class="grid">${(sampleColors.length > 0 ? sampleColors.slice(0, 4) : ["#dc2626", "#ea580c", "#16a34a", "#7c3aed"]).map((value) => `<div class="swatch" style="background:${escapeHtml(value)}"></div>`).join("")}</div>`;
    case "colors-semantic":
      return `<div class="eyebrow">Color</div><div class="title">Semantic roles</div><div class="chips"><div class="chip">Success</div><div class="chip">Warning</div><div class="chip">Error</div><div class="chip">Info</div></div>`;
    case "colors-charts":
      return `<div class="eyebrow">Color</div><div class="title">Chart palette</div><div class="grid">${(sampleColors.length > 0 ? sampleColors.slice(0, 4) : ["#1d4ed8", "#0891b2", "#16a34a", "#ea580c"]).map((value) => `<div class="swatch" style="background:${escapeHtml(value)}"></div>`).join("")}</div>`;
    case "type-display":
      return `<div class="eyebrow">Typography</div><div class="title" style="font-size:${escapeHtml(sampleFontSizes[0] ?? "26px")};font-weight:${escapeHtml(sampleFontWeights[0] ?? "700")}">${sampleHeading}</div><div class="muted">Primary display family candidate: ${firstFont}</div>`;
    case "type-headings":
      return `<div class="eyebrow">Typography</div><div class="title">Heading hierarchy</div><div class="stack"><div style="font-size:${escapeHtml(sampleFontSizes[0] ?? "20px")};font-weight:${escapeHtml(sampleFontWeights[0] ?? "700")}">H1 Heading</div><div style="font-size:${escapeHtml(sampleFontSizes[1] ?? "16px")};font-weight:${escapeHtml(sampleFontWeights[1] ?? "600")}">H2 Heading</div><div class="muted">Structured, low-hype hierarchy.</div></div>`;
    case "type-body":
      return `<div class="eyebrow">Typography</div><div class="title">Body copy</div><div class="muted">${sampleBody}</div>`;
    case "spacing":
      return `<div class="eyebrow">Foundations</div><div class="title">Spacing scale</div><div class="chips">${(sampleSpacing.length > 0 ? sampleSpacing : ["4px", "8px", "12px", "16px", "24px", "32px"]).map((value) => `<div class="chip">${escapeHtml(value)}</div>`).join("")}</div>`;
    case "radii-shadows":
      return `<div class="eyebrow">Foundations</div><div class="title">Radii & shadows</div><div class="grid"><div class="field" style="border-radius:${escapeHtml(sampleRadius)};box-shadow:${escapeHtml(sampleShadow)}">Small radius</div><div class="field" style="border-radius:12px;box-shadow:0 12px 24px rgba(15,23,42,0.12)">Large radius</div></div>`;
    case "components-buttons":
      return `<div class="eyebrow">Components</div><div class="title">Buttons</div><div class="chips"><button class="btn btn-primary">${sampleButton}</button><button class="btn btn-secondary">Secondary</button></div>`;
    case "components-cards":
      return `<div class="eyebrow">Components</div><div class="title">Cards</div><div class="stack"><div class="field"><strong>${sampleCardTitle}</strong><div class="muted">${sampleBody}</div></div><div class="field"><strong>Editorial card</strong><div class="muted">Quiet frame, clear grouping.</div></div></div>`;
    case "components-forms":
      return `<div class="eyebrow">Components</div><div class="title">Forms</div><div class="stack"><div class="field">Label<br>${sampleForm}</div><div class="field">${sampleBody}</div></div>`;
    case "components-badges-table":
      return `<div class="eyebrow">Components</div><div class="title">Badges & table</div><div class="chips"><div class="chip">${sampleBadge}</div><div class="chip">Draft</div></div><table><thead><tr><th>Item</th><th>Status</th></tr></thead><tbody><tr><td>${sampleTable}</td><td>Ready</td></tr><tr><td>Preview cards</td><td>Draft</td></tr></tbody></table>`;
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

function mergeSignals(
  target: {
    colors: Set<string>;
    fontSizes: Set<string>;
    fontWeights: Set<string>;
    spacingValues: Set<string>;
    radii: Set<string>;
    shadows: Set<string>;
  },
  next: {
    colors: string[];
    fontSizes: string[];
    fontWeights: string[];
    spacingValues: string[];
    radii: string[];
    shadows: string[];
  },
) {
  for (const value of next.colors) target.colors.add(value);
  for (const value of next.fontSizes) target.fontSizes.add(value);
  for (const value of next.fontWeights) target.fontWeights.add(value);
  for (const value of next.spacingValues) target.spacingValues.add(value);
  for (const value of next.radii) target.radii.add(value);
  for (const value of next.shadows) target.shadows.add(value);
}

function extractCssDeclarationValues(
  content: string,
  regex: RegExp,
  limit: number,
  valueGroup = 2,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) && out.length < limit) {
    const value = (match[valueGroup] ?? "").trim();
    if (!value || value.length > 120 || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function collectHtmlTextSamples(
  root: ReturnType<typeof parse>,
  selectors: string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const selector of selectors) {
    for (const node of root.querySelectorAll(selector)) {
      const text = node.text
        .replace(/\s+/g, " ")
        .trim();
      if (!text || text.length < 2 || text.length > 140 || seen.has(text)) continue;
      seen.add(text);
      out.push(text);
      if (out.length >= 6) return out;
    }
  }
  return out;
}

interface WebsiteFetchOptions {
  maxBytes: number;
  kind: "html" | "css" | "asset";
  noteBytes: (bytes: number) => void;
}

async function fetchWebsiteResource(
  inputUrl: URL,
  options: WebsiteFetchOptions,
): Promise<{ finalUrl: URL; text: string; buffer: Buffer }> {
  let current = new URL(inputUrl.toString());

  for (let redirectCount = 0; redirectCount <= MAX_FETCH_REDIRECTS; redirectCount += 1) {
    await assertSafeImportUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      headers: { "user-agent": `BurnGuard/${APP_VERSION} design-system-import` },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new DesignSystemExtractError(
          "website_fetch_failed",
          `Redirect missing Location header for ${current.toString()}`,
        );
      }
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      throw new DesignSystemExtractError(
        "website_fetch_failed",
        `Website fetch failed with HTTP ${response.status}`,
      );
    }

    const buffer = await readResponseWithinLimit(response, options.maxBytes);
    options.noteBytes(buffer.byteLength);
    return {
      finalUrl: current,
      text:
        options.kind === "asset" ? "" : buffer.toString("utf8"),
      buffer,
    };
  }

  throw new DesignSystemExtractError(
    "website_fetch_failed",
    `Too many redirects while fetching ${inputUrl.toString()}`,
  );
}

async function readResponseWithinLimit(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) {
    return Buffer.alloc(0);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      throw new DesignSystemExtractError(
        "website_fetch_failed",
        `Fetched resource exceeded ${maxBytes} bytes`,
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

async function assertSafeImportUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DesignSystemExtractError(
      "invalid_source_url",
      `Website URL must be http(s): ${url.toString()}`,
    );
  }

  const host = normalizeHost(url.hostname);
  if (isUnsafeImportHostname(host)) {
    throw new DesignSystemExtractError(
      "invalid_source_url",
      `Blocked private or local website host: ${url.hostname}`,
    );
  }

  if (isIP(host) !== 0) {
    return;
  }

  const resolved = await lookup(host, { all: true, verbatim: true }).catch(
    () => [],
  );
  for (const entry of resolved) {
    if (isUnsafeImportHostname(normalizeHost(entry.address))) {
      throw new DesignSystemExtractError(
        "invalid_source_url",
        `Blocked hostname resolved to a private or local address: ${url.hostname}`,
      );
    }
  }
}

export function isUnsafeImportHostname(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return true;
  if (BLOCKED_IMPORT_HOSTS.has(host)) return true;
  if (
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home") ||
    host.endsWith(".lan") ||
    host.endsWith(".arpa")
  ) {
    return true;
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const parts = host.split(".").map((part) => Number.parseInt(part, 10));
    const [a, b] = parts;
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return true;
    }
    return false;
  }
  if (ipVersion === 6) {
    if (host === "::1") return true;
    if (host.startsWith("fc") || host.startsWith("fd")) return true;
    if (host.startsWith("fe80:")) return true;
  }
  return false;
}

function normalizeHost(hostname: string): string {
  return hostname.trim().replace(/^\[|\]$/g, "").toLowerCase();
}

async function collectCandidateWebsitePages(baseUrl: URL, html: string) {
  const root = parse(html);
  const candidates: URL[] = [];
  const seen = new Set<string>([baseUrl.toString()]);
  for (const anchor of root.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }
    try {
      const next = new URL(href, baseUrl);
      if (next.origin !== baseUrl.origin) continue;
      if (seen.has(next.toString())) continue;
      if (/\.(pdf|png|jpg|jpeg|svg|zip)$/i.test(next.pathname)) continue;
      seen.add(next.toString());
      candidates.push(next);
      if (candidates.length >= MAX_LINKED_PAGES) break;
    } catch {
      // ignore malformed href
    }
  }
  return candidates;
}

function mergeStringSamples(target: string[], next: string[], limit: number) {
  const seen = new Set(target);
  for (const value of next) {
    if (seen.has(value)) continue;
    target.push(value);
    seen.add(value);
    if (target.length >= limit) return;
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

function normalizeCssTokenName(value: string): string | null {
  const normalized = value.trim().replace(/^--/, "");
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(normalized)) return null;
  return normalized;
}

function normalizeFontFamily(value: string | undefined): string | null {
  const normalized = (value ?? "")
    .replace(/[;{}<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || normalized.length > 80) return null;
  return normalized;
}

function isColorTokenValue(value: string): boolean {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > 140 ||
    /[;{}<>\n\r]/.test(trimmed)
  ) {
    return false;
  }
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) {
    return true;
  }
  if (
    /^(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color|color-mix)\(/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/^var\(--[a-zA-Z0-9_-]+\)$/.test(trimmed)) {
    return true;
  }
  return /^[a-zA-Z]+$/.test(trimmed);
}

function upsertCssCustomProperty(
  css: string,
  tokenName: string,
  value: string,
): string {
  const declaration = `  --${tokenName}: ${value};`;
  const existing = new RegExp(
    `(^\\s*--${escapeRegExp(tokenName)}\\s*:\\s*)[^;]+(;\\s*$)`,
    "m",
  );
  if (existing.test(css)) {
    return css.replace(existing, `$1${value}$2`);
  }

  const rootMatch = /:root\s*\{[\s\S]*?\n\}/.exec(css);
  if (rootMatch) {
    const closeIndex = rootMatch.index + rootMatch[0].lastIndexOf("\n}");
    return `${css.slice(0, closeIndex)}\n${declaration}${css.slice(closeIndex)}`;
  }

  const prefix = css.endsWith("\n") || css.length === 0 ? css : `${css}\n`;
  return `${prefix}:root {\n${declaration}\n}\n`;
}

async function appendFontFaceRule(
  fontsCssPath: string,
  family: string,
  fileName: string,
) {
  const existing = await readFile(fontsCssPath, "utf8").catch(() => "");
  const safeFamily = family.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const safeUrl = fileName.replace(/\\/g, "/").replace(/'/g, "%27");
  const rule = `@font-face {
  font-family: '${safeFamily}';
  src: url('./${safeUrl}') format('${fontFormatForFile(fileName)}');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
`;
  const next =
    existing.includes(`url('./${safeUrl}')`) || existing.includes(`url("${safeUrl}")`)
      ? existing
      : `${existing.trimEnd()}\n\n${rule}`.trimStart();
  await mkdir(path.dirname(fontsCssPath), { recursive: true });
  await writeFile(fontsCssPath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
}

function fontFormatForFile(fileName: string): string {
  switch (path.extname(fileName).toLowerCase()) {
    case ".woff2":
      return "woff2";
    case ".woff":
      return "woff";
    case ".otf":
      return "opentype";
    default:
      return "truetype";
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
