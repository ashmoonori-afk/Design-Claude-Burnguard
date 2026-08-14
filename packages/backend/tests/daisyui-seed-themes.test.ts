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

const COLOR_TOKENS = [
  "bg",
  "bg-subtle",
  "bg-muted",
  "surface",
  "fg-1",
  "primary-blue",
  "action-blue",
  "fg-on-brand",
  "secondary",
  "fg-on-secondary",
  "accent",
  "fg-on-accent",
  "surface-inverse",
  "fg-on-dark",
  "info",
  "fg-on-info",
  "success",
  "fg-on-success",
  "warning-yellow",
  "fg-on-warning",
  "error",
  "fg-on-error",
  "border",
] as const;

const themesRoot = path.join(resolveRepoRoot(), "design system themes");
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

  test("bootstrap copies token files that parse as direct hex without OKLCH", async () => {
    const destinationRoot = await mkdtemp(path.join(tmpdir(), "bg-theme-seeds-"));
    try {
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
        for (const token of COLOR_TOKENS) {
          expect(tokens.get(token), `${slug}: --${token}`).toMatch(
            /^#[0-9a-f]{6}$/i,
          );
        }
      }
    } finally {
      await rm(destinationRoot, { recursive: true, force: true });
    }
  });
});
