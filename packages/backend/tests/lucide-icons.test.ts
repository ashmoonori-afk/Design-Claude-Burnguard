import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  LUCIDE_ICONS,
  renderLucideIconReference,
} from "../src/harness/assets/lucide/icons";
import { buildPrompt } from "../src/harness/prompt-builder";
import { DECK_SKILL_MD } from "../src/harness/skills/deck-skill";
import { PROTOTYPE_SKILL_MD } from "../src/harness/skills/prototype-skill";

const MAX_SKILL_CHARS = 4000;
const ICON_POINTER_SENTINEL = "LUCIDE_ICON_REFERENCE";
const ASSET_DIR = path.resolve(import.meta.dir, "../src/harness/assets/lucide");

type BuildContext = Parameters<typeof buildPrompt>[0];

function makeContext(projectType: "prototype" | "slide_deck"): BuildContext {
  return {
    project: {
      project_id: "icon-test",
      project_name: "Icon test",
      project_type: projectType,
      entrypoint: projectType === "prototype" ? "index.html" : "deck.html",
      project_dir: path.join(import.meta.dir, "fixtures", "missing-icon-project"),
      options_json: null,
    },
    files: [],
    attachments: [],
    designSystem: null,
    openComments: [],
  } as BuildContext;
}

describe("bundled Lucide icon vocabulary", () => {
  test("contains a valid curated subset", () => {
    const entries = Object.entries(LUCIDE_ICONS);

    expect(entries.length).toBeGreaterThanOrEqual(24);
    expect(entries.length).toBeLessThanOrEqual(40);
    for (const [name, icon] of entries) {
      expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(icon.viewBox.trim().length).toBeGreaterThan(0);
      expect(icon.pathData.trim().length).toBeGreaterThan(0);
    }
  });

  test("ships the generated on-demand reference and donor license", async () => {
    const [reference, license] = await Promise.all([
      readFile(path.join(ASSET_DIR, "reference.md"), "utf8"),
      readFile(path.join(ASSET_DIR, "LICENSE"), "utf8"),
    ]);

    expect(reference).toBe(renderLucideIconReference());
    expect(reference).toContain(ICON_POINTER_SENTINEL);
    expect(reference).toContain('stroke="currentColor"');
    expect(reference).toContain("var(--icon-size");
    for (const [name, icon] of Object.entries(LUCIDE_ICONS)) {
      expect(reference).toContain(`### ${name}`);
      expect(reference).toContain(icon.pathData);
    }
    expect(license).toContain("ISC License");
    expect(license).toContain("Lucide Contributors");
  });

  test("keeps full artifact skills inside the per-turn budget", () => {
    expect(PROTOTYPE_SKILL_MD.length).toBeLessThanOrEqual(MAX_SKILL_CHARS);
    expect(DECK_SKILL_MD.length).toBeLessThanOrEqual(MAX_SKILL_CHARS);
  });

  test("ships the icon reference sentinel in prototype and deck prompts", async () => {
    for (const projectType of ["prototype", "slide_deck"] as const) {
      const prompt = await buildPrompt(makeContext(projectType), {
        type: "user.message",
        text: "Use an icon",
      });
      expect(prompt).toContain(ICON_POINTER_SENTINEL);
    }
  });
});
