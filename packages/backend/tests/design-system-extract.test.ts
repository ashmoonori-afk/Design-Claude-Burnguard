import { describe, expect, test } from "bun:test";
import {
  contentTypeForDesignSystemFile,
  extractCssCustomProperties,
  extractCssStyleSignals,
  extractHtmlComponentSamples,
  inferSourceType,
  isUnsafeImportHostname,
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
