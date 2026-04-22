import { describe, expect, test } from "bun:test";
import {
  buildHandoffSpec,
  EXTRACT_HANDOFF_FN,
  HANDOFF_STYLE_KEYS,
} from "../src/services/export-handoff";

describe("buildHandoffSpec", () => {
  test("wraps extracted pages with project + design-system metadata", () => {
    const spec = buildHandoffSpec({
      project: {
        id: "p1",
        name: "Test",
        type: "slide_deck",
        entrypoint: "deck.html",
      },
      viewport: { width: 1280, height: 720 },
      pages: [
        {
          slide_index: 0,
          title: "Slide 1",
          rect: { w: 1280, h: 720 },
          nodes: [
            {
              bg_id: "hero",
              tag: "h1",
              parent_bg_id: null,
              text: "Hero",
              rect: { x: 64, y: 96, w: 800, h: 120 },
              styles: { "font-size": "96px", color: "rgb(255,255,255)" },
            },
          ],
        },
      ],
      designSystem: {
        name: "Goldman Sachs",
        tokensFileInZip: "tokens/colors_and_type.css",
      },
      generatedAt: 1700000000,
    });

    expect(spec.spec_version).toBe(1);
    expect(spec.generated_at).toBe(1700000000);
    expect(spec.project.name).toBe("Test");
    expect(spec.viewport).toEqual({ width: 1280, height: 720 });
    expect(spec.design_system.name).toBe("Goldman Sachs");
    expect(spec.design_system.tokens_file).toBe("tokens/colors_and_type.css");
    expect(spec.pages).toHaveLength(1);
    expect(spec.pages[0].nodes[0].bg_id).toBe("hero");
  });

  test("null-tolerant design-system metadata", () => {
    const spec = buildHandoffSpec({
      project: {
        id: "p1",
        name: "Test",
        type: "prototype",
        entrypoint: "index.html",
      },
      viewport: { width: 1280, height: 720 },
      pages: [],
      designSystem: { name: null, tokensFileInZip: null },
    });
    expect(spec.design_system).toEqual({ name: null, tokens_file: null });
    expect(spec.pages).toEqual([]);
  });

  test("generated_at defaults to now when omitted", () => {
    const before = Date.now();
    const spec = buildHandoffSpec({
      project: {
        id: "p1",
        name: "T",
        type: "prototype",
        entrypoint: "index.html",
      },
      viewport: { width: 100, height: 100 },
      pages: [],
      designSystem: { name: null, tokensFileInZip: null },
    });
    const after = Date.now();
    expect(spec.generated_at).toBeGreaterThanOrEqual(before);
    expect(spec.generated_at).toBeLessThanOrEqual(after);
  });
});

describe("EXTRACT_HANDOFF_FN", () => {
  test("is an IIFE-compatible function source that references the required API", () => {
    expect(EXTRACT_HANDOFF_FN.startsWith("() => {")).toBe(true);
    expect(EXTRACT_HANDOFF_FN).toContain("[data-bg-node-id]");
    expect(EXTRACT_HANDOFF_FN).toContain("[data-slide]");
    expect(EXTRACT_HANDOFF_FN).toContain("getComputedStyle");
    // Must read every property we committed to exposing, otherwise the
    // spec JSON loses fidelity for the listed key.
    for (const key of HANDOFF_STYLE_KEYS) {
      expect(EXTRACT_HANDOFF_FN).toContain(JSON.stringify(key));
    }
  });
});
