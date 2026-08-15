import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { seedBundledDesignSystems } from "../src/bootstrap";
import {
  bundledDesignSystemId,
  bundledDesignSystems,
} from "../src/data/bundled-design-systems";
import { resolveRepoRoot } from "../src/lib/paths";
import { extractCssCustomProperties } from "../src/services/design-system-extract";

const THEME_SLUGS = [
  "light",
  "dark",
  "cupcake",
  "retro",
  "cyberpunk",
  "synthwave",
  "luxury",
  "dracula",
  "nord",
  "business",
] as const;

const themesRoot = path.join(resolveRepoRoot(), "design system themes");
const canonicalTokensPath = path.join(
  resolveRepoRoot(),
  "design system sample",
  "colors_and_type.css",
);
const attribution =
  "/* Derived from daisyUI (https://github.com/saadeghi/daisyui) - MIT License, Copyright (c) 2020 Pouya Saadeghi. Converted for BurnGuard. */";

describe("bundled daisyUI-derived design systems", () => {
  test("register the curated themes and ship the complete seed shape", async () => {
    expect(bundledDesignSystems.map(({ slug }) => slug)).toEqual(THEME_SLUGS);

    for (const slug of THEME_SLUGS) {
      const themeDir = path.join(themesRoot, slug);
      for (const fileName of ["colors_and_type.css", "SKILL.md", "README.md"]) {
        expect((await stat(path.join(themeDir, fileName))).isFile()).toBe(true);
      }
    }
  });

  test("bootstrap copies token files that satisfy the canonical token contract", async () => {
    const destinationRoot = await mkdtemp(path.join(tmpdir(), "bg-theme-seeds-"));
    try {
      const canonicalCss = await readFile(canonicalTokensPath, "utf8");
      const requiredTokens = [...extractCssCustomProperties(canonicalCss).keys()];
      expect(requiredTokens.length).toBeGreaterThan(0);

      await seedBundledDesignSystems(resolveRepoRoot(), destinationRoot);

      for (const slug of THEME_SLUGS) {
        const css = await readFile(
          path.join(
            destinationRoot,
            bundledDesignSystemId(slug),
            "colors_and_type.css",
          ),
          "utf8",
        );
        expect(css.startsWith(attribution)).toBe(true);
        expect(css.toLowerCase()).not.toContain("oklch(");

        const tokens = extractCssCustomProperties(css);
        for (const token of requiredTokens) {
          expect(tokens.has(token), `${slug}: --${token}`).toBe(true);
          expect(tokens.get(token)?.trim(), `${slug}: --${token}`).not.toBe("");
        }

        const colorSection = css.split("/* Type families */", 1)[0] ?? "";
        for (const [token, value] of extractCssCustomProperties(colorSection)) {
          expect(value, `${slug}: --${token}`).toMatch(/^#[0-9a-f]{6}$/i);
        }

        expect(css).not.toMatch(/--(?:r-selector|r-field|r-box|depth)\s*:/);
      }
    } finally {
      await rm(destinationRoot, { recursive: true, force: true });
    }
  });
});
