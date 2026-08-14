import { describe, expect, test } from "bun:test";
import { MAX_SKILL_CHARS } from "../src/harness/prompt-builder";
import { DECK_SKILL_MD } from "../src/harness/skills/deck-skill";

describe("deck projection type scale", () => {
  test("selects one archetype per slide", () => {
    expect(DECK_SKILL_MD).toContain(
      "Layout archetypes (pick one per slide via `data-layout`)",
    );
  });

  test("declares type and spacing token families", () => {
    expect(DECK_SKILL_MD).toContain("--deck-type-");
    expect(DECK_SKILL_MD).toContain("--deck-pad-");
  });

  test("sets the projected text floor", () => {
    expect(DECK_SKILL_MD).toContain("24px");
  });

  test("stays within the injected skill budget", () => {
    expect(DECK_SKILL_MD.length).toBeLessThanOrEqual(MAX_SKILL_CHARS);
  });
});
