import { describe, expect, test } from "bun:test";
import {
  contentTypeForDesignSystemFile,
  extractCssCustomProperties,
  inferSourceType,
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
