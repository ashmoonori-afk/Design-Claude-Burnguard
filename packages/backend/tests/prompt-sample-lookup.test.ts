import { describe, expect, test } from "bun:test";
import { getPromptSampleBySlug } from "../src/db/seed-tutorials";

describe("getPromptSampleBySlug", () => {
  test("returns the four shipped prompt-sample slugs", () => {
    // The four samples are referenced by slug from the rendered
    // sample HTML's "Try this prompt" form — if any of these go
    // missing the form posts to a 404 and the user gets stuck.
    const slugs = [
      "clearinvoice-static-saas",
      "taskly-liquid-glass",
      "mindloop-monochrome",
      "velorah-cinematic",
    ];
    for (const slug of slugs) {
      const sample = getPromptSampleBySlug(slug);
      expect(sample).not.toBeNull();
      expect(sample!.slug).toBe(slug);
      expect(sample!.prompt.length).toBeGreaterThan(50);
    }
  });

  test("returns null for an unknown slug", () => {
    expect(getPromptSampleBySlug("does-not-exist")).toBeNull();
    expect(getPromptSampleBySlug("")).toBeNull();
  });
});
