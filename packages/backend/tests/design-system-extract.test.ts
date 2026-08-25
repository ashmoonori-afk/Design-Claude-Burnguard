import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ensureTokensCssImportsFonts,
  extractCssCustomProperties,
  extractCssStyleSignals,
  extractFontFamilies,
  isColorTokenValue,
  MAX_CSS_DECLARATIONS,
  MAX_CSS_PARSE_BYTES,
  parseCssSource,
  upsertCssCustomProperty,
} from "../src/services/extraction-css";
import { collectCandidateWebsitePages, extractHtmlComponentSamples } from "../src/services/extraction-html";
import {
  contentTypeForDesignSystemFile,
  inferExtractionSourceType as inferSourceType,
  isUnsafeImportHostname,
  listFilesRecursive,
} from "../src/services/extraction-path";
import {
  assertUploadSize,
  inferUploadKind,
  normalizeUploadPages,
  normalizeUploadStringList,
  readUploadManifest,
} from "../src/services/extraction-upload";
import {
  abortable,
  awaitChildWithAbort,
  createAcquisitionBudget,
  acquisitionLimits,
  ExtractionAcquisitionError,
  MAX_AGGREGATE_SOURCE_BYTES,
  MAX_LOCAL_DEPTH,
  MAX_LOCAL_FILES,
  MAX_SOURCE_FILE_BYTES,
} from "../src/services/extraction-acquisition";
import { analyzeLocalTree } from "../src/services/extraction-local-tree";

async function awaitBounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("bounded child exit deadline exceeded")), 10_000);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

describe("bounded extraction acquisition", () => {
  test("Given a parent abort When an operation is pending Then cancellation is propagated exactly", async () => {
    // Given
    const parent = new AbortController();
    const budget = createAcquisitionBudget(parent.signal, 30_000);
    let cancelled = false;
    const pending = abortable(new Promise<never>(() => {}), budget.signal, () => { cancelled = true; });

    // When
    parent.abort();

    // Then
    await expect(pending).rejects.toBeInstanceOf(ExtractionAcquisitionError);
    expect(cancelled).toBe(true);
    budget.dispose();
  });

  test("Given a TERM-resistant owned child When its signal aborts Then KILL is reaped and an unrelated sentinel survives", async () => {
    // Given
    const child = Bun.spawn([process.execPath, "-e", "process.on('SIGTERM',()=>{});console.log('READY');await new Promise(()=>{})"], { stdout: "pipe", stderr: "ignore" });
    const sentinel = Bun.spawn([process.execPath, "-e", "process.on('SIGTERM',()=>process.exit(0));console.log('READY');await new Promise(()=>{})"], { stdout: "pipe", stderr: "ignore" });
    const childReader = child.stdout.getReader();
    const sentinelReader = sentinel.stdout.getReader();
    await Promise.all([childReader.read(), sentinelReader.read()]);
    const exactChildExit = child.exited;
    const exactSentinelExit = sentinel.exited;
    const controller = new AbortController();
    const operation = awaitChildWithAbort(child, controller.signal);

    // When
    controller.abort();
    const rejection = await operation.catch((error: unknown) => error);
    const awaitedExitCode = await awaitBounded(exactChildExit);

    // Then
    expect(rejection).toBeInstanceOf(ExtractionAcquisitionError);
    if (!(rejection instanceof ExtractionAcquisitionError)) throw rejection;
    expect(rejection.cleanupReceipt).toEqual({ pid: child.pid, exitCode: 137, termSent: true, killSent: true, pidAbsent: true });
    expect(awaitedExitCode).toBe(137);
    expect(Bun.spawnSync(["/bin/kill", "-0", String(child.pid)]).exitCode).not.toBe(0);
    expect(Bun.spawnSync(["/bin/kill", "-0", String(sentinel.pid)]).exitCode).toBe(0);
    sentinel.kill("SIGTERM");
    expect(await awaitBounded(exactSentinelExit)).toBe(0);
    await Promise.all([childReader.cancel(), sentinelReader.cancel()]);
  });
  test("Given a real CSS tree When production analysis runs Then bounded reads produce declarations and border signals", async () => {
    // Given
    const root = await mkdtemp(path.join(tmpdir(), "bg-css-tree-"));
    try {
      await writeFile(path.join(root, "tokens.css"), ":root{--brand:#123456}.card{font-family:Inter,sans-serif;border:1px solid #123456}");

      // When
      const analysis = await analyzeLocalTree(root, "Fixture", new AbortController().signal);

      // Then
      expect(analysis.cssDeclarations).toHaveLength(3);
      expect(analysis.cssVars.get("brand")).toBe("#123456");
      expect(analysis.fontFamilies).toEqual(["Inter"]);
      expect(analysis.borders).toEqual(["1px solid #123456"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("Given local depth, file count, per-file bytes, and aggregate bytes beyond each boundary When production analysis runs Then exact typed limits reject", async () => {
    // Given
    const fixtures: string[] = [];
    try {
      const depthRoot = await mkdtemp(path.join(tmpdir(), "bg-depth-limit-"));
      fixtures.push(depthRoot);
      let nested = depthRoot;
      for (let depth = 0; depth <= MAX_LOCAL_DEPTH; depth += 1) {
        nested = path.join(nested, "d");
        await mkdir(nested);
      }
      const filesRoot = await mkdtemp(path.join(tmpdir(), "bg-file-limit-"));
      fixtures.push(filesRoot);
      await Promise.all(Array.from({ length: MAX_LOCAL_FILES + 1 }, (_, index) => writeFile(path.join(filesRoot, `${index}.txt`), "x")));
      const perFileRoot = await mkdtemp(path.join(tmpdir(), "bg-per-file-limit-"));
      fixtures.push(perFileRoot);
      const oversized = path.join(perFileRoot, "large.css");
      await writeFile(oversized, "");
      await truncate(oversized, MAX_SOURCE_FILE_BYTES + 1);
      const aggregateRoot = await mkdtemp(path.join(tmpdir(), "bg-aggregate-limit-"));
      fixtures.push(aggregateRoot);
      const aggregateCount = Math.floor(MAX_AGGREGATE_SOURCE_BYTES / MAX_SOURCE_FILE_BYTES) + 1;
      for (let index = 0; index < aggregateCount; index += 1) {
        const fixture = path.join(aggregateRoot, `${index}.md`);
        await writeFile(fixture, "");
        await truncate(fixture, MAX_SOURCE_FILE_BYTES);
      }
      const signal = new AbortController().signal;

      // When / Then
      await expect(analyzeLocalTree(depthRoot, "Depth", signal)).rejects.toMatchObject({ limit: "local_depth" });
      await expect(analyzeLocalTree(filesRoot, "Files", signal)).rejects.toMatchObject({ limit: "local_files" });
      await expect(analyzeLocalTree(perFileRoot, "File", signal)).rejects.toMatchObject({ limit: "source_file_bytes" });
      await expect(analyzeLocalTree(aggregateRoot, "Aggregate", signal)).rejects.toMatchObject({ limit: "aggregate_source_bytes" });
    } finally {
      await Promise.all(fixtures.map((fixture) => rm(fixture, { recursive: true, force: true })));
    }
  });

  test("Given CSS byte and declaration complexity beyond each boundary When the real parser runs Then bounded typed evidence is deterministic", async () => {
    // Given
    const oversized = " ".repeat(MAX_CSS_PARSE_BYTES + 1);
    const complex = `.x{${Array.from({ length: MAX_CSS_DECLARATIONS + 1 }, (_, index) => `--x${index}:${index};`).join("")}}`;

    // When
    const byteResult = await parseCssSource({ content: oversized, sourceId: "large.css" });
    const itemResult = await parseCssSource({ content: complex, sourceId: "complex.css" });

    // Then
    expect(byteResult.issues).toEqual([{ key: "css-input", reason: "css_input_too_large", sourceLocator: "large.css:1:1" }]);
    expect(itemResult.issues.some((issue) => issue.reason === "css_declaration_limit")).toBe(true);
    expect(itemResult.declarations).toHaveLength(MAX_CSS_DECLARATIONS);
  });
});

describe("inferSourceType", () => {
  test("accepts credential-free HTTPS Git transports", () => {
    expect(inferSourceType("https://github.com/acme/design-system")).toBe("github");
    expect(inferSourceType("https://gitlab.com/acme/design-system.git")).toBe("github");
  });

  test.each([
    "file:///tmp/design-system",
    "git@github.com:acme/design-system.git",
    "ssh://git@github.com/acme/design-system.git",
    "git://github.com/acme/design-system.git",
    "https://user:secret@github.com/acme/design-system.git",
    "../design-system",
    "/tmp/design-system",
  ])("rejects local, SSH, Git, and credential-bearing transport %s", (sourceUrl) => {
    expect(() => inferSourceType(sourceUrl)).toThrow();
  });

  test("treats regular web pages as website source", () => {
    expect(inferSourceType("https://brand.example.com")).toBe("website");
    expect(inferSourceType("https://example.com/design")).toBe("website");
  });
});

describe("inferUploadKind", () => {
  test("detects supported upload kinds by file extension", () => {
    expect(inferUploadKind("brand-deck.pptx")).toBe("pptx");
    expect(inferUploadKind("tokens.pdf")).toBe("pdf");
  });

  test("rejects declared upload bytes before stream consumption", () => {
    const file = new File(["12345"], "fixture.pdf", { type: "application/pdf" });
    expect(() => assertUploadSize(file, acquisitionLimits({ uploadBytes: 4 }))).toThrow();
  });

  test("falls back to content type when extension is ambiguous", () => {
    expect(inferUploadKind("upload.bin", "application/pdf")).toBe("pdf");
    expect(
      inferUploadKind(
        "upload.bin",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    ).toBe("pptx");
    expect(inferUploadKind("upload.bin", "application/octet-stream")).toBeNull();
  });
});

describe("extractCssCustomProperties", () => {
  test("extracts custom properties from css blocks", async () => {
    const vars = await extractCssCustomProperties(`
      :root {
        --primary-blue: #0057B8;
        --font-sans: "Inter";
      }
    `);
    expect(vars.get("primary-blue")).toBe("#0057B8");
    expect(vars.get("font-sans")).toBe('"Inter"');
  });
});

describe("design system token css editing", () => {
  test("updates existing custom properties and appends missing ones inside :root", () => {
    const css = `:root {
  --primary-blue: #0057B8;
}
`;
    const updated = upsertCssCustomProperty(css, "primary-blue", "#123456");
    expect(updated).toContain("--primary-blue: #123456;");
    expect(updated).not.toContain("--primary-blue: #0057B8;");

    const appended = upsertCssCustomProperty(updated, "brand-red", "#ff0000");
    expect(appended).toContain("--brand-red: #ff0000;");
    expect(appended.indexOf("--brand-red")).toBeLessThan(appended.indexOf("\n}"));
  });

  test("creates a :root block when custom properties are written to an empty file", () => {
    expect(upsertCssCustomProperty("", "primary", "#000000")).toBe(
      `:root {
  --primary: #000000;
}
`,
    );
  });

  test("ensures token css imports local font faces exactly once", () => {
    const css = `/* Brand tokens */
:root {
  --font-sans: Acme, sans-serif;
}
`;
    const imported = ensureTokensCssImportsFonts(css);
    expect(imported).toContain("@import url('./fonts/fonts.css');");
    expect(ensureTokensCssImportsFonts(imported)).toBe(imported);
  });

  test("preserves @charset before inserting font imports", () => {
    const imported = ensureTokensCssImportsFonts(`@charset "utf-8";
:root {}
`);
    expect(imported.startsWith(`@charset "utf-8";
@import url('./fonts/fonts.css');
`)).toBe(true);
  });
});

describe("extractCssStyleSignals", () => {
  test("extracts colors, font sizes, spacing, radii, and shadows from plain css declarations", async () => {
    const signals = await extractCssStyleSignals(`
      .hero {
        color: #112233;
        background-color: rgb(1, 2, 3);
        font-size: 48px;
        font-weight: 700;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      }
    `);
    expect(signals.colors).toContain("#112233");
    expect(signals.colors).toContain("rgb(1, 2, 3)");
    expect(signals.fontSizes).toContain("48px");
    expect(signals.fontWeights).toContain("700");
    expect(signals.spacingValues).toContain("16px 24px");
    expect(signals.radii).toContain("12px");
    expect(signals.shadows[0]).toContain("0 8px 24px");
  });
});

describe("CSS extraction helpers", () => {
  test("extracts first font families and validates color token forms", async () => {
    expect(await extractFontFamilies(".a{font-family:'Inter',sans-serif;}.b{font-family:Roboto,Arial;}")).toEqual(["Inter", "Roboto"]);
    expect(isColorTokenValue("#123456")).toBe(true);
    expect(isColorTokenValue("rgb(1, 2, 3)")).toBe(true);
    expect(isColorTokenValue("url(https://example.com/a.png)")).toBe(false);
  });
});

describe("extractHtmlComponentSamples", () => {
  test("extracts representative text samples for common component buckets", () => {
    const samples = extractHtmlComponentSamples(`
      <html><body>
        <h1>Investor Update</h1>
        <p>Quarterly performance summary.</p>
        <button>Get started</button>
        <div class="card">Revenue momentum</div>
        <form><label>Email</label><input /></form>
        <span class="badge">Published</span>
        <table><tr><td>Row 1</td></tr></table>
      </body></html>
    `);
    expect(samples.headings).toContain("Investor Update");
    expect(samples.body).toContain("Quarterly performance summary.");
    expect(samples.buttons).toContain("Get started");
    expect(samples.cards).toContain("Revenue momentum");
    expect(samples.forms).toContain("Email");
    expect(samples.badges).toContain("Published");
    expect(samples.tables).toContain("Row 1");
  });
});

describe("collectCandidateWebsitePages", () => {
  test("keeps unique same-origin pages and rejects fragments, contacts, assets, and remote links", () => {
    const controller = new AbortController();
    const pages = collectCandidateWebsitePages(
      new URL("https://example.com/"),
      `<a href="/about">About</a><a href="/about">Again</a><a href="#part">Part</a><a href="mailto:x@example.com">Mail</a><a href="/asset.png">Image</a><a href="https://remote.example/page">Remote</a>`,
      controller.signal,
    );
    expect(pages.map((page) => page.toString())).toEqual(["https://example.com/about"]);
  });
});

describe("listFilesRecursive", () => {
  test("walks files, ignores dependency directories, and honors the shared signal", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "bg-list-tree-"));
    try {
      await mkdir(path.join(directory, "nested"), { recursive: true });
      await mkdir(path.join(directory, "node_modules"), { recursive: true });
      await writeFile(path.join(directory, "nested", "kept.css"), "a{}");
      await writeFile(path.join(directory, "node_modules", "ignored.css"), "a{}");
      const files = await listFilesRecursive(directory, new AbortController().signal);
      expect(files.map((file) => path.relative(directory, file))).toEqual([path.join("nested", "kept.css")]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("contentTypeForDesignSystemFile", () => {
  test("maps common preview file extensions", () => {
    expect(contentTypeForDesignSystemFile("preview/colors-brand.html")).toBe(
      "text/html; charset=utf-8",
    );
    expect(contentTypeForDesignSystemFile("colors_and_type.css")).toBe(
      "text/css; charset=utf-8",
    );
    expect(contentTypeForDesignSystemFile("assets/logos/brand.svg")).toBe(
      "image/svg+xml",
    );
  });
});

describe("isUnsafeImportHostname", () => {
  test("blocks localhost and private network literals", () => {
    expect(isUnsafeImportHostname("localhost")).toBe(true);
    expect(isUnsafeImportHostname("127.0.0.1")).toBe(true);
    expect(isUnsafeImportHostname("192.168.0.10")).toBe(true);
    expect(isUnsafeImportHostname("172.20.1.2")).toBe(true);
    expect(isUnsafeImportHostname("10.0.0.8")).toBe(true);
    expect(isUnsafeImportHostname("169.254.169.254")).toBe(true);
    expect(isUnsafeImportHostname("::1")).toBe(true);
  });

  test("allows public hostnames and public ip literals", () => {
    expect(isUnsafeImportHostname("example.com")).toBe(false);
    expect(isUnsafeImportHostname("brand.example.com")).toBe(false);
    expect(isUnsafeImportHostname("8.8.8.8")).toBe(false);
  });
});

describe("normalizeUploadStringList", () => {
  test("trims + collapses whitespace and dedupes by normalized value", () => {
    const out = normalizeUploadStringList(
      ["  Hero  ", "Hero", "Button  text\t", "Button text"],
      10,
    );
    expect(out).toEqual(["Hero", "Button text"]);
  });

  test("skips non-strings and respects the cap", () => {
    const out = normalizeUploadStringList(
      [1, null, undefined, "keep", "keep", "second", "third"],
      2,
    );
    expect(out).toEqual(["keep", "second"]);
  });

  test("returns [] when the input is not an array", () => {
    expect(normalizeUploadStringList(null, 5)).toEqual([]);
    expect(normalizeUploadStringList("nope" as unknown, 5)).toEqual([]);
    expect(normalizeUploadStringList({}, 5)).toEqual([]);
  });
});

describe("normalizeUploadPages", () => {
  test("coerces the common good-shape input", () => {
    const pages = normalizeUploadPages([
      { index: 1, title: " Quarterly ", summary: "Rev", text_excerpt: "Q" },
      { index: 2, title: "Forecast", summary: "Next", text_excerpt: "F" },
    ]);
    expect(pages).toEqual([
      { index: 1, title: "Quarterly", summary: "Rev", text_excerpt: "Q" },
      { index: 2, title: "Forecast", summary: "Next", text_excerpt: "F" },
    ]);
  });

  test("assigns sequential indices when missing / non-numeric", () => {
    const pages = normalizeUploadPages([
      { title: "A", summary: "a", text_excerpt: "aa" },
      { index: "oops", title: "B", summary: "b", text_excerpt: "bb" },
      { index: 5, title: "C", summary: "c", text_excerpt: "cc" },
    ]);
    expect(pages.map((p) => p.index)).toEqual([1, 2, 5]);
  });

  test("caps at MAX_UPLOAD_UI_KIT_PAGES (8)", () => {
    const long = Array.from({ length: 20 }, (_, i) => ({
      index: i + 1,
      title: `T${i}`,
      summary: `S${i}`,
      text_excerpt: `E${i}`,
    }));
    expect(normalizeUploadPages(long).length).toBe(8);
  });

  test("drops non-object entries and non-array inputs", () => {
    expect(normalizeUploadPages(null)).toEqual([]);
    expect(normalizeUploadPages(["bad", 42, null])).toEqual([]);
  });
});

describe("readUploadManifest", () => {
  test("parses + normalizes a valid pptx manifest", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "bg-manifest-test-"));
    try {
      const target = path.join(dir, "manifest.json");
      await writeFile(
        target,
        JSON.stringify({
          kind: "pptx",
          brand_name: "Acme",
          page_count: 3,
          fonts: ["Inter", "Inter"],
          colors: ["#FF0000"],
          font_sizes: ["24pt"],
          font_weights: ["700"],
          spacing_values: [],
          radii: [],
          shadows: [],
          notes: ["ok"],
          headings: ["Hello", "Hello"],
          bodies: ["Body"],
          misc_lines: ["misc"],
          pages: [
            {
              index: 1,
              title: "Cover",
              summary: "Intro",
              text_excerpt: "Hello\nWorld",
            },
          ],
        }),
      );

      const manifest = await readUploadManifest(target);
      expect(manifest.kind).toBe("pptx");
      expect(manifest.brand_name).toBe("Acme");
      expect(manifest.page_count).toBe(3);
      expect(manifest.fonts).toEqual(["Inter"]);
      expect(manifest.headings).toEqual(["Hello"]);
      expect(manifest.pages.length).toBe(1);
      expect(manifest.pages[0]!.title).toBe("Cover");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("throws when the file is missing", async () => {
    await expect(
      readUploadManifest(path.join(tmpdir(), "bg-missing-manifest.json")),
    ).rejects.toThrow();
  });

  test("throws on invalid JSON + invalid kind", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "bg-manifest-test-"));
    try {
      const bad = path.join(dir, "bad.json");
      await writeFile(bad, "{ not valid json");
      await expect(readUploadManifest(bad)).rejects.toThrow();

      const wrong = path.join(dir, "wrong.json");
      await writeFile(wrong, JSON.stringify({ kind: "docx" }));
      await expect(readUploadManifest(wrong)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("defensively defaults missing array fields to []", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "bg-manifest-test-"));
    try {
      const target = path.join(dir, "sparse.json");
      await writeFile(
        target,
        JSON.stringify({ kind: "pdf", brand_name: "S", page_count: 1 }),
      );
      const manifest = await readUploadManifest(target);
      expect(manifest.fonts).toEqual([]);
      expect(manifest.headings).toEqual([]);
      expect(manifest.misc_lines).toEqual([]);
      expect(manifest.pages).toEqual([]);
      expect(manifest.notes).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
