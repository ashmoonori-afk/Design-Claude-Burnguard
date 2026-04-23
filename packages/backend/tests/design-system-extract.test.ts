import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  contentTypeForDesignSystemFile,
  extractCssCustomProperties,
  extractCssStyleSignals,
  extractHtmlComponentSamples,
  inferSourceType,
  inferUploadKind,
  isUnsafeImportHostname,
  normalizeUploadPages,
  normalizeUploadStringList,
  readUploadManifest,
} from "../src/services/design-system-extract";

describe("inferSourceType", () => {
  test("treats git-style URLs as github source", () => {
    expect(inferSourceType("https://github.com/acme/design-system")).toBe("github");
    expect(inferSourceType("git@github.com:acme/design-system.git")).toBe("github");
    expect(inferSourceType("https://gitlab.com/acme/design-system.git")).toBe("github");
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
  test("extracts custom properties from css blocks", () => {
    const vars = extractCssCustomProperties(`
      :root {
        --primary-blue: #0057B8;
        --font-sans: "Inter";
      }
    `);
    expect(vars.get("primary-blue")).toBe("#0057B8");
    expect(vars.get("font-sans")).toBe('"Inter"');
  });
});

describe("extractCssStyleSignals", () => {
  test("extracts colors, font sizes, spacing, radii, and shadows from plain css declarations", () => {
    const signals = extractCssStyleSignals(`
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
