import { describe, expect, test } from "bun:test";
import { parse } from "node-html-parser";
import { renderInitialArtifact } from "../src/db/templates";

describe("initial graphic template", () => {
  test("Given a graphic canvas When rendered Then one exact server-owned artboard is emitted", () => {
    const html = renderInitialArtifact({
      name: "행사 포스터",
      type: "graphic",
      options: { graphic_canvas: { schema_version: 1, width: 1080, height: 1920 } },
    });
    const root = parse(html);

    expect(root.querySelectorAll("[data-graphic-artboard]")).toHaveLength(1);
    expect(html).toContain("width: 1080px");
    expect(html).toContain("height: 1920px");
    expect(root.querySelectorAll("[data-bg-node-id]").length).toBeGreaterThanOrEqual(3);
    expect(root.textContent.trim().length).toBeGreaterThan(20);
    expect(html).not.toContain("data-slide");
    expect(html).not.toContain("deck-stage.js");
  });
});
